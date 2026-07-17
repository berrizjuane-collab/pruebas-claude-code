#include "yggdrasil/core/game_engine.hpp"

#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using namespace yggdrasil;

void require(const bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

void submitCatalogRecruit(GameEngine& engine, int& nextId) {
    while (engine.tree().contains(nextId)) ++nextId;
    RecruitCommand command;
    command.mode = RecruitmentMode::Catalog;
    command.id = nextId++;
    command.templateKind = TemplateKind::Species;
    command.templateIndex = 0;
    std::string error;
    require(engine.submitRecruit(command, &error), "setup recruit failed: " + error);
}

void advanceToSecondCombatSetup(GameEngine& engine) {
    GameConfig config;
    config.mode = GameMode::Manual;
    config.maxTurns = 2;
    config.seed = 0xC0FFEEULL;
    engine.start(config);

    int nextId = 300;
    for (int cycle = 0; cycle < 1000; ++cycle) {
        if (engine.snapshot().turn == 2 && engine.hasPendingDecision()) break;
        if (engine.hasPendingDecision()) {
            submitCatalogRecruit(engine, nextId);
        } else if (engine.awaitingWorkshop()) {
            std::string error;
            require(engine.continueWorkshop(&error), "could not close workshop: " + error);
        } else {
            engine.pump();
        }
    }
    require(engine.snapshot().turn == 2 && engine.hasPendingDecision(),
            "could not reach turn-two recruitment");
    while (engine.hasPendingDecision()) submitCatalogRecruit(engine, nextId);
    require(engine.snapshot().turn == 2 && !engine.gameOver(),
            "turn-two recruitment did not settle at combat setup");
}

enum class WeaponChoice { Plain, Gauss, IonBlade, Malware };

struct CombatResult {
    Operative attacker;
    Operative target;
    std::vector<GameEvent> events;
    VictorySummary victory;
};

CombatResult runCombat(const WeaponChoice weaponChoice,
                       const std::optional<Shield>& targetShield = std::nullopt) {
    GameEngine engine;
    require(engine.loadCatalogs(), "combat fixture could not load catalogs");
    advanceToSecondCombatSetup(engine);

    engine.tree().clear();
    Operative attacker(10, "Attacker", Faction::Neon, 1000, 0, 50, 0, 100);
    if (weaponChoice == WeaponChoice::Plain) {
        attacker.enqueueWeapon({9001, "Test Beam", "Direct", 100, 100, 7});
    } else {
        const int weaponId = weaponChoice == WeaponChoice::Gauss ? 2
                           : weaponChoice == WeaponChoice::IonBlade ? 3 : 5;
        const WeaponDefinition* definition = engine.catalogs().weapon_by_id(weaponId);
        require(definition != nullptr, "canonical special weapon is missing");
        attacker.enqueueWeapon({definition->id, definition->name, definition->type,
                                definition->damage, definition->ammunition,
                                definition->use_cost});
    }

    Operative target(20, "Target", Faction::Omega, 1000, 0, 0, 0, 10);
    if (targetShield) target.pushShield(*targetShield);
    require(engine.tree().insert(attacker) && engine.tree().insert(target),
            "combat fixture insertion failed");

    for (int cycle = 0; cycle < 1000 && !engine.gameOver(); ++cycle) {
        require(!engine.hasPendingDecision(), "ordinary combat unexpectedly requested input");
        engine.pump();
    }
    require(engine.gameOver(), "combat fixture did not finish");
    require(engine.tree().validate().valid, "combat fixture damaged the B-tree");
    const Operative* finalAttacker = engine.tree().find(10);
    const Operative* finalTarget = engine.tree().find(20);
    require(finalAttacker != nullptr && finalTarget != nullptr,
            "combat fixture unexpectedly removed a survivor");
    return {*finalAttacker, *finalTarget, engine.history(), engine.victory()};
}

Shield canonicalShield(const int id) {
    GameEngine engine;
    require(engine.loadCatalogs(), "shield fixture could not load catalogs");
    const ShieldDefinition* definition = engine.catalogs().shield_by_id(id);
    require(definition != nullptr, "canonical shield is missing");
    return {definition->id, definition->name, definition->type, definition->absorption,
            definition->durability, definition->weight};
}

const GameEvent& findHistoryEvent(const GameEngine& engine, const EventType type,
                                  const int source, const int target) {
    const auto& history = engine.history();
    const auto found = std::find_if(history.begin(), history.end(), [&](const GameEvent& event) {
        return event.type == type && event.sourceId == source && event.targetId == target;
    });
    require(found != history.end(), "expected engine event is missing");
    return *found;
}

void pumpUntilTacticalDecision(GameEngine& engine, const DecisionType expected) {
    for (int cycle = 0; cycle < 1000 && !engine.hasPendingDecision() && !engine.gameOver(); ++cycle)
        engine.pump();
    require(engine.hasPendingDecision(), "tactical fixture never requested a decision");
    require(engine.pendingDecision().type == expected, "unexpected tactical decision type");
}

void finishCombat(GameEngine& engine) {
    for (int cycle = 0; cycle < 1000 && !engine.gameOver(); ++cycle) {
        require(!engine.hasPendingDecision(), "combat retained an unresolved decision");
        engine.pump();
    }
    require(engine.gameOver(), "combat fixture did not finish");
    require(engine.tree().validate().valid, "combat fixture damaged the B-tree");
}

const GameEvent& findEvent(const CombatResult& result, const EventType type,
                           const int source = 10, const int target = 20) {
    const auto found = std::find_if(result.events.begin(), result.events.end(),
        [&](const GameEvent& event) {
            return event.type == type && event.sourceId == source && event.targetId == target;
        });
    require(found != result.events.end(), "expected combat event is missing");
    return *found;
}

void testDirectDamageAndInitiative() {
    const CombatResult result = runCombat(WeaponChoice::Plain);
    require(result.target.baseHp == 850, "direct damage must equal weapon 100 + attack 50");
    require(result.attacker.activeWeapon() != nullptr &&
                result.attacker.activeWeapon()->ammunition == 50,
            "an attack must spend the canonical fixed 50 ammunition");
    require(findEvent(result, EventType::DamageApplied).amount == 150,
            "DamageApplied must expose the exact direct hit");
    const GameEvent& spent = findEvent(result, EventType::WeaponSpent, 10, 0);
    require(spent.amount == 50 && spent.secondaryAmount == 50,
            "WeaponSpent event must expose spent and remaining ammunition");
    const auto initiative = std::find_if(result.events.begin(), result.events.end(),
        [](const GameEvent& event) { return event.type == EventType::InitiativeOrder; });
    require(initiative != result.events.end() && initiative->ids == std::vector<int>({10, 20}),
            "initiative must sort by descending speed, then ascending ID");
    require(result.victory.statistics.attacks == 1, "exactly one armed operative must attack");
}

void testShieldResistanceAndOverflow() {
    const Shield durable{8001, "Fixture Shield", "Personal", 200, 200, 0};
    const CombatResult absorbed = runCombat(WeaponChoice::Plain, durable);
    require(absorbed.target.baseHp == 1000, "an intact shield must protect HP");
    require(absorbed.target.activeShield() != nullptr &&
                absorbed.target.activeShield()->absorption == 80 &&
                absorbed.target.activeShield()->durability == 150,
            "20% resistance must absorb 30, apply 120, then reduce durability by 50");
    require(findEvent(absorbed, EventType::DamageAbsorbed).amount == 30,
            "shield resistance event must report 30 prevented damage");
    const GameEvent& weakened = findEvent(absorbed, EventType::ShieldDamaged);
    require(weakened.amount == 120 && weakened.secondaryAmount == 80,
            "shield event must report impact and remaining absorption");

    const Shield fragile{8002, "Fragile Shield", "Personal", 50, 200, 0};
    const CombatResult overflow = runCombat(WeaponChoice::Plain, fragile);
    require(overflow.target.activeShield() == nullptr && overflow.target.baseHp == 930,
            "shield overflow must remove the shield and pass 70 damage to HP");
    const GameEvent& broken = findEvent(overflow, EventType::ShieldBroken);
    require(broken.amount == 120 && broken.secondaryAmount == 70,
            "ShieldBroken must report impact and overflow");
    require(findEvent(overflow, EventType::DamageApplied).amount == 70,
            "overflow DamageApplied amount changed");
}

void testGaussCriticalFormula() {
    const CombatResult result = runCombat(WeaponChoice::Gauss);
    require(result.target.baseHp == 670,
            "Gauss must deal (250 + 50) plus a truncated 10% critical bonus");
    require(findEvent(result, EventType::DamageApplied).amount == 330,
            "Gauss DamageApplied must include the 30-point bonus");
    require(result.attacker.activeWeapon() == nullptr,
            "the 50-ammunition Gauss rifle must leave the FIFO arsenal when spent");
    (void)findEvent(result, EventType::WeaponExhausted, 10, 0);
}

void testIonBladeBonusAgainstKineticBarrier() {
    const CombatResult result = runCombat(WeaponChoice::IonBlade, canonicalShield(1));
    require(result.target.baseHp == 970 && result.target.activeShield() == nullptr,
            "Ion blade must add 20% before applying the kinetic barrier overflow");
    require(findEvent(result, EventType::DamageAbsorbed).amount == 36,
            "kinetic barrier must resist 20% of the 180-point base attack");
    const GameEvent& broken = findEvent(result, EventType::ShieldBroken);
    require(broken.amount == 180 && broken.secondaryAmount == 30,
            "Ion bonus must restore total impact to 180 and overflow exactly 30");
    require(findEvent(result, EventType::DamageApplied).amount == 30,
            "Ion overflow must be exposed as exact HP damage");
}

void testOpticalCamouflageEvasion() {
    const CombatResult result = runCombat(WeaponChoice::Plain, canonicalShield(5));
    require(result.target.baseHp == 960 && result.target.activeShield() == nullptr,
            "camouflage must reduce the post-resistance impact to 90 and overflow 40");
    require(findEvent(result, EventType::DamageAbsorbed).amount == 22,
            "camouflage shield resistance must truncate 15% of 150 to 22");
    require(findEvent(result, EventType::AttackEvaded).amount == 38,
            "camouflage must evade a truncated 30% of the 128-point impact");
    require(findEvent(result, EventType::ShieldBroken).amount == 90,
            "camouflage shield must receive the reduced 90-point impact");
}

void testReactiveArmorRebound() {
    const CombatResult result = runCombat(WeaponChoice::Plain, canonicalShield(3));
    require(result.attacker.baseHp == 955,
            "reactive armor must return all 45 resistance points to an unshielded attacker");
    require(result.target.baseHp == 1000 && result.target.activeShield() != nullptr,
            "reactive armor must keep direct damage away from HP while absorption remains");
    require(result.target.activeShield()->absorption == 15 &&
                result.target.activeShield()->durability == 250,
            "reactive armor must retain 15 absorption and lose 50 durability");
    require(findEvent(result, EventType::ReactiveDamage, 20, 10).amount == 45,
            "ReactiveDamage must expose the exact reflected resistance");
}

void testMalwareDamageAndSpeedPenalty() {
    const CombatResult result = runCombat(WeaponChoice::Malware);
    require(result.target.baseHp == 890,
            "malware must still deal its 60 weapon damage plus 50 attack");
    require(result.target.speed == 0,
            "malware must clamp a 20-point speed penalty at zero");
    require(findEvent(result, EventType::Information).amount == 20,
            "malware information event must expose the canonical speed penalty");
}

void testEmpUsesPrimaryDeflectorForAreaImpact() {
    GameEngine engine;
    require(engine.loadCatalogs(), "EMP fixture could not load catalogs");
    advanceToSecondCombatSetup(engine);
    engine.tree().clear();

    const WeaponDefinition* emp = engine.catalogs().weapon_by_id(4);
    const ShieldDefinition* deflector = engine.catalogs().shield_by_id(2);
    require(emp != nullptr && deflector != nullptr, "canonical EMP fixture entries are missing");

    Operative attacker(10, "EMP Attacker", Faction::Neon, 1000, 0, 10, 0, 100);
    attacker.enqueueWeapon({emp->id, emp->name, emp->type, emp->damage,
                            emp->ammunition, emp->use_cost});
    Operative lowerTarget(20, "Lower Deflector", Faction::Omega, 1000, 0, 0, 0, 10);
    Operative primaryTarget(30, "Primary Deflector", Faction::Omega, 1000, 0, 0, 0, 5);
    lowerTarget.pushShield({deflector->id, deflector->name, deflector->type, 1000, 100,
                            deflector->weight});
    primaryTarget.pushShield({deflector->id, deflector->name, deflector->type, 1000, 500,
                              deflector->weight});
    require(engine.tree().insert(attacker) && engine.tree().insert(lowerTarget) &&
                engine.tree().insert(primaryTarget),
            "EMP fixture insertion failed");

    finishCombat(engine);
    const Operative* lower = engine.tree().find(20);
    const Operative* primary = engine.tree().find(30);
    require(lower != nullptr && primary != nullptr && lower->activeShield() != nullptr &&
                primary->activeShield() != nullptr,
            "EMP fixture unexpectedly removed a deflector");
    require(lower->baseHp == 1000 && primary->baseHp == 1000,
            "linked deflectors must protect both targets' HP");
    require(lower->activeShield()->absorption == 950 &&
                primary->activeShield()->absorption == 950,
            "EMP must apply the primary target's fixed 50-point area impact to all enemies");
    require(findHistoryEvent(engine, EventType::AttackStarted, 10, 30).targetId == 30,
            "highest-ID enemy must remain the canonical automatic primary target");
    require(findHistoryEvent(engine, EventType::DamageAbsorbed, 10, 30).amount == 50,
            "primary deflector durability must determine the shared area impact");
}

void testTrojanConversionAndQuantumFirewall() {
    auto runTrojan = [](GameEngine& engine, const bool protectedByFirewall) {
        require(engine.loadCatalogs(), "Trojan fixture could not load catalogs");
        advanceToSecondCombatSetup(engine);
        engine.tree().clear();

        Operative attacker(10, "Trojan Hero", Faction::Neon, 1000, 0, 0, 0, 100, true);
        attacker.enqueueWeapon({9100, "TROYANO", "TROYANO", 0, 150, 0});
        Operative target(20, "Trojan Target", Faction::Omega, 1000, 0, 0, 0, 10);
        if (protectedByFirewall) target.pushShield(canonicalShield(4));
        require(engine.tree().insert(attacker) && engine.tree().insert(target),
                "Trojan fixture insertion failed");

        pumpUntilTacticalDecision(engine, DecisionType::TrojanTarget);
        require(engine.pendingDecision().candidates == std::vector<int>({20}),
                "Trojan decision must expose the live global enemy");
        std::string error;
        require(engine.submitTactical({20, 0}, &error), "Trojan submission failed: " + error);
        finishCombat(engine);
    };

    GameEngine converted;
    runTrojan(converted, false);
    const Operative* convertedTarget = converted.tree().find(20);
    require(convertedTarget != nullptr && convertedTarget->faction == Faction::Neon &&
                convertedTarget->recentlyConverted,
            "unprotected Trojan target must convert and skip the rest of this combat");
    require(converted.victory().statistics.conversions == 1,
            "successful Trojan conversion must update battle statistics");
    require(converted.tree().find(10)->weapons.empty(),
            "Trojan must remain single-use even after CRUD raises its ammunition");
    (void)findHistoryEvent(converted, EventType::OperativeConverted, 10, 20);

    GameEngine blocked;
    runTrojan(blocked, true);
    const Operative* blockedTarget = blocked.tree().find(20);
    require(blockedTarget != nullptr && blockedTarget->faction == Faction::Omega,
            "quantum firewall must preserve the target faction");
    require(blocked.victory().statistics.conversions == 0,
            "blocked Trojan must not increment conversion statistics");
    (void)findHistoryEvent(blocked, EventType::TrojanBlocked, 10, 20);
}

void testDisruptionRelocatesDuringCleanup() {
    GameEngine engine;
    require(engine.loadCatalogs(), "Disruption fixture could not load catalogs");
    advanceToSecondCombatSetup(engine);
    engine.tree().clear();

    Operative attacker(10, "Disruption Hero", Faction::Neon, 1000, 0, 0, 0, 100, true);
    attacker.enqueueWeapon({9200, "DISRUPCION", "DISRUPCION", 0, 150, 0});
    Operative target(20, "Relocation Target", Faction::Omega, 1000, 0, 0, 0, 10);
    require(engine.tree().insert(attacker) && engine.tree().insert(target),
            "Disruption fixture insertion failed");

    pumpUntilTacticalDecision(engine, DecisionType::Disruption);
    std::string error;
    require(engine.submitTactical({20, 25}, &error), "Disruption submission failed: " + error);
    require(engine.tree().contains(20) && !engine.tree().contains(25),
            "Disruption must remain queued until cleanup");
    (void)findHistoryEvent(engine, EventType::DisruptionQueued, 10, 20);

    finishCombat(engine);
    require(!engine.tree().contains(20) && engine.tree().contains(25),
            "cleanup must rebuild the target under the requested free ID");
    require(engine.tree().validate().valid,
            "Disruption relocation must preserve every B-tree invariant");
    require(engine.victory().statistics.disruptions == 1,
            "completed Disruption must update battle statistics");
    require(engine.tree().find(10)->weapons.empty(),
            "Disruption must remain single-use even after CRUD raises its ammunition");
    const GameEvent& relocated = findHistoryEvent(engine, EventType::OperativeRelocated, 20, 25);
    require(relocated.nodeId != 0,
            "OperativeRelocated must identify the rebuilt destination node");
}

} // namespace

int main() {
    try {
        testDirectDamageAndInitiative();
        testShieldResistanceAndOverflow();
        testGaussCriticalFormula();
        testIonBladeBonusAgainstKineticBarrier();
        testOpticalCamouflageEvasion();
        testReactiveArmorRebound();
        testMalwareDamageAndSpeedPenalty();
        testEmpUsesPrimaryDeflectorForAreaImpact();
        testTrojanConversionAndQuantumFirewall();
        testDisruptionRelocatesDuringCleanup();
        std::cout << "test_combat: OK\n";
        return EXIT_SUCCESS;
    } catch (const std::exception& error) {
        std::cerr << "test_combat: FAIL: " << error.what() << '\n';
        return EXIT_FAILURE;
    }
}
