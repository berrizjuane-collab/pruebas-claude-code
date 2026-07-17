#include "yggdrasil/ai/ai_controller.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using namespace yggdrasil;

void require(const bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

struct RunSummary {
    std::uint64_t digest{0};
    VictorySummary victory;
    std::vector<GameEvent> events;
    std::vector<Operative> operatives;
};

RunSummary playCanonicalGame(const std::uint64_t seed) {
    GameEngine engine;
    require(engine.loadCatalogs(), "catalogs must resolve from the build working directory");

    GameConfig config;
    config.mode = GameMode::AiVsAi;
    config.maxTurns = 8;
    config.seed = seed;
    engine.start(config);

    AIController ai;
    std::string error;
    require(ai.runHeadless(engine, 250'000, &error), "AI run failed: " + error);
    require(engine.gameOver(), "canonical game did not finish");
    require(engine.tree().validate().valid, "canonical game left an invalid B-tree");
    return {engine.historyDigest(), engine.victory(), engine.history(), engine.tree().inOrder()};
}

void testDataResolutionAndOpening() {
    GameEngine engine;
    require(engine.loadCatalogs(), "default data discovery failed");

    std::error_code error;
    const auto expected = std::filesystem::weakly_canonical(
        std::filesystem::current_path() / "data", error);
    require(!error && engine.catalogs().data_directory() == expected,
            "tests must load the copied bin/data catalogs, not a source-relative fallback");

    GameConfig config;
    config.mode = GameMode::AiVsAi;
    config.maxTurns = 7;
    config.seed = 0x12345678ULL;
    engine.start(config);

    const GameSnapshot opening = engine.snapshot();
    require(opening.turn == 0 && opening.maxTurns == 8,
            "odd turn limits must normalize to the next even turn");
    require(opening.preCombatTurns == 4 && opening.phase == GamePhase::TurnStart,
            "opening phase/pre-combat schedule changed");
    require(engine.history().size() == 2, "opening must emit session and coin events");
    require(engine.history()[0].type == EventType::SessionStarted &&
                engine.history()[1].type == EventType::CoinFlipped,
            "opening event order changed");
    require(engine.history()[0].sequence == 1 && engine.history()[1].sequence == 2,
            "opening sequences must begin at one");

    engine.pump();
    const GameSnapshot firstTurn = engine.snapshot();
    require(firstTurn.turn == 1 && firstTurn.phase == GamePhase::Recruitment,
            "first pump must enter turn-one recruitment");
    require(engine.pendingDecision().type == DecisionType::Recruit &&
                !engine.pendingDecision().heroOnly &&
                engine.pendingDecision().recruitmentTier == 1,
            "turn-one recruitment contract changed");
    require(firstTurn.insertionRoll >= 1 && firstTurn.insertionRoll <= 3 &&
                firstTurn.remainingInsertions == firstTurn.insertionRoll,
            "canonical insertion die must produce one to three recruits");
}

void testCanonicalScheduleAndDigest() {
    constexpr std::uint64_t seed = 0x5947474452415349ULL;
    constexpr std::uint64_t canonicalDigest = 1'316'071'720'836'201'966ULL;
    const RunSummary first = playCanonicalGame(seed);
    const RunSummary replay = playCanonicalGame(seed);

    require(first.digest != 0 && first.digest == replay.digest,
            "same seed must reproduce the exact history digest");
    require(first.digest == canonicalDigest,
            "the canonical seeded history hash changed; audit gameplay/event changes");
    require(first.victory.winner == replay.victory.winner &&
                first.victory.reason == replay.victory.reason &&
                first.operatives == replay.operatives,
            "same seed must reproduce result and final operatives");
    require(!first.events.empty() && first.events.back().type == EventType::VictoryDeclared &&
                first.events.back().phase == GamePhase::Victory,
            "VictoryDeclared must close the canonical event stream");

    std::vector<GameEvent> turnStarts;
    std::array<int, 61> preCombat{};
    std::array<int, 61> combat{};
    std::array<int, 61> heroWindow{};
    std::array<int, 61> dieRoll{};
    std::array<int, 61> cleanupPhase{};
    int turnEnds = 0;
    std::uint64_t expectedSequence = 1;

    for (const GameEvent& event : first.events) {
        require(event.sequence == expectedSequence++, "event sequence must be contiguous");
        if (event.type == EventType::TurnStarted) turnStarts.push_back(event);
        if (event.type == EventType::CombatStarted) ++combat.at(static_cast<std::size_t>(event.turn));
        if (event.type == EventType::DieRolled) ++dieRoll.at(static_cast<std::size_t>(event.turn));
        if (event.type == EventType::TurnEnded) ++turnEnds;
        if (event.type == EventType::Information && event.title == "Pre-combate")
            ++preCombat.at(static_cast<std::size_t>(event.turn));
        if (event.type == EventType::Information && event.title == "Ventana de heroe")
            ++heroWindow.at(static_cast<std::size_t>(event.turn));
        if (event.type == EventType::PhaseChanged && event.phase == GamePhase::Cleanup)
            ++cleanupPhase.at(static_cast<std::size_t>(event.turn));
    }

    require(static_cast<int>(turnStarts.size()) == first.victory.turnsPlayed,
            "every played turn must have exactly one TurnStarted event");
    require(turnEnds == first.victory.turnsPlayed - 1,
            "the victory turn must end with VictoryDeclared instead of TurnEnded");
    const Faction firstFaction = turnStarts.front().faction;
    constexpr std::array heroTurns{3, 4, 6, 7, 9, 10, 12, 13, 15, 16};
    for (int turn = 1; turn <= first.victory.turnsPlayed; ++turn) {
        const GameEvent& started = turnStarts[static_cast<std::size_t>(turn - 1)];
        require(started.turn == turn, "TurnStarted numbering changed");
        const Faction expectedFaction = turn % 2 == 1 ? firstFaction : opposingFaction(firstFaction);
        require(started.faction == expectedFaction, "active faction must alternate every turn");
        require(cleanupPhase[static_cast<std::size_t>(turn)] == 1,
                "every played turn must enter cleanup exactly once");

        const bool preCombatTurn = turn <= 4;
        require(preCombat[static_cast<std::size_t>(turn)] == (preCombatTurn ? 1 : 0),
                "pre-combat must cover exactly turns one through four");
        require(combat[static_cast<std::size_t>(turn)] == (preCombatTurn ? 0 : 1),
                "combat must begin exactly on turn five");

        const bool hero = std::find(heroTurns.begin(), heroTurns.end(), turn) != heroTurns.end();
        require(heroWindow[static_cast<std::size_t>(turn)] == (hero ? 1 : 0),
                "hero recruitment schedule changed");
        require(dieRoll[static_cast<std::size_t>(turn)] == (hero ? 0 : 1),
                "normal turns must roll once and hero turns must not roll");
    }
}

} // namespace

int main() {
    try {
        testDataResolutionAndOpening();
        testCanonicalScheduleAndDigest();
        std::cout << "test_engine: OK\n";
        return EXIT_SUCCESS;
    } catch (const std::exception& error) {
        std::cerr << "test_engine: FAIL: " << error.what() << '\n';
        return EXIT_FAILURE;
    }
}
