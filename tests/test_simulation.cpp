#include "yggdrasil/ai/ai_controller.hpp"

#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using namespace yggdrasil;

void require(const bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}
struct Result {
    std::uint64_t digest{0};
    VictorySummary victory;
    std::vector<Operative> operatives;
    std::size_t height{0};
};

Result simulate(const std::uint64_t seed) {
    GameEngine engine;
    require(engine.loadCatalogs(), "simulation catalogs did not resolve from bin/data");
    GameConfig config;
    config.mode = GameMode::AiVsAi;
    config.maxTurns = 8;
    config.seed = seed;
    engine.start(config);

    AIController ai;
    std::string error;
    require(ai.runHeadless(engine, 250'000, &error), "headless simulation failed: " + error);
    require(engine.gameOver() && !engine.hasPendingDecision(),
            "headless simulation did not settle");

    const BTreeValidation validation = engine.tree().validate();
    require(validation.valid, validation.errors.empty() ? "invalid B-tree" : validation.errors[0]);
    const std::vector<Operative> operatives = engine.tree().inOrder();
    require(operatives.size() == engine.tree().size(), "tree traversal count mismatch");

    int neon = 0;
    int omega = 0;
    int priorId = 0;
    for (const Operative& operative : operatives) {
        require(operative.id > priorId && operative.id >= 1 && operative.id <= 999,
                "final operative IDs violate ordering/range invariants");
        require(operative.alive() && operative.faction != Faction::Neutral,
                "cleanup left a dead or neutral operative");
        priorId = operative.id;
        neon += operative.faction == Faction::Neon ? 1 : 0;
        omega += operative.faction == Faction::Omega ? 1 : 0;
    }
    const VictorySummary& victory = engine.victory();
    require(victory.reason != VictoryReason::None && victory.turnsPlayed >= 2 &&
                victory.turnsPlayed <= 8,
            "victory summary is incomplete");
    require(victory.neonSurvivors == neon && victory.omegaSurvivors == omega,
            "victory survivor totals disagree with the final tree");
    require(victory.statistics.neonCasualties >= 0 &&
                victory.statistics.omegaCasualties >= 0 &&
                victory.statistics.conversions >= 0 && victory.statistics.disruptions >= 0 &&
                victory.statistics.attacks >= 0 && victory.statistics.shieldsBroken >= 0,
            "battle statistics must remain nonnegative");

    std::uint64_t expectedSequence = 1;
    int priorTurn = 0;
    for (const GameEvent& event : engine.history()) {
        require(event.sequence == expectedSequence++, "history sequence has a gap");
        require(event.turn >= priorTurn, "history turn order moved backwards");
        require(event.title != "Invariante B-4 violada",
                "engine reported a structural invariant failure");
        priorTurn = event.turn;
    }
    require(!engine.history().empty() &&
                engine.history().back().type == EventType::VictoryDeclared,
            "VictoryDeclared must terminate every simulation");
    return {engine.historyDigest(), victory, operatives, engine.tree().height()};
}

bool sameVictory(const VictorySummary& left, const VictorySummary& right) {
    return left.winner == right.winner && left.reason == right.reason &&
           left.neonSurvivors == right.neonSurvivors &&
           left.omegaSurvivors == right.omegaSurvivors &&
           left.turnsPlayed == right.turnsPlayed &&
           left.totalInsertions == right.totalInsertions &&
           left.statistics.attacks == right.statistics.attacks &&
           left.statistics.conversions == right.statistics.conversions &&
           left.statistics.disruptions == right.statistics.disruptions;
}

void testManyMatchesAndReplay() {
    std::set<std::uint64_t> digests;
    for (std::uint64_t index = 0; index < 24; ++index) {
        const std::uint64_t seed = 0x9E3779B97F4A7C15ULL * (index + 1);
        const Result result = simulate(seed);
        require(result.digest != 0, "history digest must never be zero");
        digests.insert(result.digest);
    }
    require(digests.size() > 12, "many distinct seeds collapsed to too few histories");

    constexpr std::uint64_t replaySeed = 0xDEADBEEF12345678ULL;
    const Result first = simulate(replaySeed);
    const Result second = simulate(replaySeed);
    require(first.digest == second.digest && sameVictory(first.victory, second.victory) &&
                first.operatives == second.operatives && first.height == second.height,
            "same-seed replay changed digest, result, or final tree");
}

} // namespace

int main() {
    try {
        testManyMatchesAndReplay();
        std::cout << "test_simulation: OK\n";
        return EXIT_SUCCESS;
    } catch (const std::exception& error) {
        std::cerr << "test_simulation: FAIL: " << error.what() << '\n';
        return EXIT_FAILURE;
    }
}
