#include "yggdrasil/ai/ai_controller.hpp"

#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

using yggdrasil::AIController;
using yggdrasil::Faction;
using yggdrasil::GameConfig;
using yggdrasil::GameEngine;
using yggdrasil::GameMode;
using yggdrasil::Operative;
using yggdrasil::VictorySummary;

struct Options {
    std::uint64_t seed{0x5947474452415349ULL};
    int turns{10};
    int games{1};
    std::filesystem::path dataDirectory;
    bool help{false};
};

struct Outcome {
    std::uint64_t digest{0};
    VictorySummary victory;
    std::vector<Operative> operatives;
    std::size_t treeHeight{0};
};

void usage(std::ostream& output, const std::string_view program) {
    output << "Usage: " << program
           << " [--seed N] [--turns 2..60] [--games N] [--data-dir PATH]\n";
}

template <typename Integer>
bool parseInteger(const std::string& text, Integer& value) {
    try {
        if (text.empty() || text.front() == '-') return false;
        std::size_t consumed = 0;
        const bool hexadecimal = text.size() > 2 && text[0] == '0' &&
                                 (text[1] == 'x' || text[1] == 'X');
        const unsigned long long parsed = std::stoull(text, &consumed, hexadecimal ? 16 : 10);
        if (consumed != text.size() || parsed > std::numeric_limits<Integer>::max()) return false;
        value = static_cast<Integer>(parsed);
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

bool parseOptions(const int argc, char** argv, Options& options, std::string& error) {
    for (int index = 1; index < argc; ++index) {
        const std::string argument = argv[index];
        if (argument == "--help" || argument == "-h") {
            options.help = true;
            return true;
        }
        if (argument != "--seed" && argument != "--turns" && argument != "--games" &&
            argument != "--data-dir") {
            error = "unknown option: " + argument;
            return false;
        }
        if (++index >= argc) {
            error = "missing value for " + argument;
            return false;
        }
        const std::string value = argv[index];
        if (argument == "--data-dir") {
            options.dataDirectory = value;
        } else if (argument == "--seed") {
            if (!parseInteger(value, options.seed)) {
                error = "invalid --seed value: " + value;
                return false;
            }
        } else if (argument == "--turns") {
            if (!parseInteger(value, options.turns) || options.turns < 2 || options.turns > 60) {
                error = "--turns must be between 2 and 60";
                return false;
            }
        } else if (!parseInteger(value, options.games) || options.games < 1 ||
                   options.games > 1000) {
            error = "--games must be between 1 and 1000";
            return false;
        }
    }
    return true;
}

bool sameVictory(const VictorySummary& left, const VictorySummary& right) {
    return left.winner == right.winner && left.reason == right.reason &&
           left.neonSurvivors == right.neonSurvivors &&
           left.omegaSurvivors == right.omegaSurvivors &&
           left.turnsPlayed == right.turnsPlayed &&
           left.totalInsertions == right.totalInsertions && left.seed == right.seed &&
           left.statistics.neonCasualties == right.statistics.neonCasualties &&
           left.statistics.omegaCasualties == right.statistics.omegaCasualties &&
           left.statistics.conversions == right.statistics.conversions &&
           left.statistics.disruptions == right.statistics.disruptions &&
           left.statistics.attacks == right.statistics.attacks &&
           left.statistics.shieldsBroken == right.statistics.shieldsBroken;
}

bool verifyInvariants(const GameEngine& engine, std::string& error) {
    if (!engine.gameOver() || engine.hasPendingDecision()) {
        error = "the engine did not reach a settled victory state";
        return false;
    }
    const auto validation = engine.tree().validate();
    if (!validation.valid) {
        error = validation.errors.empty() ? "B-tree validation failed" : validation.errors.front();
        return false;
    }
    const auto operatives = engine.tree().inOrder();
    if (operatives.size() != engine.tree().size()) {
        error = "tree size and traversal size differ";
        return false;
    }
    int neon = 0;
    int omega = 0;
    int previousId = 0;
    for (const Operative& operative : operatives) {
        if (operative.id < 1 || operative.id > 999 || operative.id <= previousId) {
            error = "operative IDs are not unique, ordered, and inside 1..999";
            return false;
        }
        if (!operative.alive() || operative.faction == Faction::Neutral) {
            error = "a dead or neutral operative survived cleanup";
            return false;
        }
        previousId = operative.id;
        neon += operative.faction == Faction::Neon ? 1 : 0;
        omega += operative.faction == Faction::Omega ? 1 : 0;
    }
    const VictorySummary& victory = engine.victory();
    if (victory.reason == yggdrasil::VictoryReason::None ||
        victory.turnsPlayed < 2 || victory.turnsPlayed > 60) {
        error = "the completed game has an invalid victory summary";
        return false;
    }
    if (victory.neonSurvivors != neon || victory.omegaSurvivors != omega) {
        error = "victory survivor totals disagree with the final tree";
        return false;
    }
    const auto& statistics = victory.statistics;
    if (statistics.neonCasualties < 0 || statistics.omegaCasualties < 0 ||
        statistics.conversions < 0 || statistics.disruptions < 0 ||
        statistics.attacks < 0 || statistics.shieldsBroken < 0) {
        error = "the completed game has negative battle statistics";
        return false;
    }
    std::uint64_t sequence = 0;
    int turn = 0;
    for (const auto& event : engine.history()) {
        if (event.sequence != ++sequence || event.turn < turn) {
            error = "event sequence or turn ordering is not monotonic";
            return false;
        }
        turn = event.turn;
        if (event.title == "Invariante B-4 violada") {
            error = "the engine reported a B-tree invariant violation";
            return false;
        }
    }
    if (engine.history().empty() ||
        engine.history().back().type != yggdrasil::EventType::VictoryDeclared ||
        engine.historyDigest() == 0) {
        error = "the completed game has no stable event history";
        return false;
    }
    return true;
}

std::optional<Outcome> play(const Options& options, const std::uint64_t seed,
                            const std::filesystem::path& executable, std::string& error) {
    GameEngine engine;
    if (!engine.loadCatalogs(options.dataDirectory, executable)) {
        error = "could not load catalogs";
        for (const std::string& diagnostic : engine.catalogDiagnostics()) {
            error += "\n  " + diagnostic;
        }
        return std::nullopt;
    }

    GameConfig config;
    config.mode = GameMode::AiVsAi;
    config.maxTurns = options.turns;
    config.seed = seed;
    engine.start(config);

    AIController ai;
    if (!ai.runHeadless(engine, 250'000, &error)) return std::nullopt;
    if (!verifyInvariants(engine, error)) return std::nullopt;

    return Outcome{engine.historyDigest(), engine.victory(), engine.tree().inOrder(),
                   engine.tree().height()};
}

} // namespace

int main(const int argc, char** argv) {
    Options options;
    std::string error;
    if (!parseOptions(argc, argv, options, error)) {
        std::cerr << "yggdrasil_sim: " << error << '\n';
        usage(std::cerr, argc > 0 ? argv[0] : "yggdrasil_sim");
        return 2;
    }
    if (options.help) {
        usage(std::cout, argc > 0 ? argv[0] : "yggdrasil_sim");
        return 0;
    }

    std::error_code pathError;
    const std::filesystem::path executable =
        std::filesystem::absolute(argc > 0 ? argv[0] : "yggdrasil_sim", pathError);

    for (int game = 0; game < options.games; ++game) {
        const std::uint64_t seed = options.seed + static_cast<std::uint64_t>(game);
        const auto first = play(options, seed, executable, error);
        if (!first) {
            std::cerr << "game " << (game + 1) << " failed: " << error << '\n';
            return 3;
        }
        const auto replay = play(options, seed, executable, error);
        if (!replay) {
            std::cerr << "determinism replay " << (game + 1) << " failed: " << error << '\n';
            return 4;
        }
        if (first->digest != replay->digest || !sameVictory(first->victory, replay->victory) ||
            first->treeHeight != replay->treeHeight ||
            first->operatives != replay->operatives) {
            std::cerr << "game " << (game + 1)
                      << " is not deterministic for seed " << seed << '\n';
            return 5;
        }

        std::cout << "game=" << (game + 1) << " seed=" << seed
                  << " turns=" << first->victory.turnsPlayed
                  << " winner=" << yggdrasil::factionName(first->victory.winner)
                  << " reason=" << yggdrasil::victoryReasonName(first->victory.reason)
                  << " survivors=" << first->victory.neonSurvivors << ':'
                  << first->victory.omegaSurvivors << " digest=" << first->digest << '\n';
    }

    return 0;
}
