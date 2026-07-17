#include "yggdrasil/core/game_engine.hpp"

#include <algorithm>
#include <array>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using namespace yggdrasil;

void require(const bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

int bestRecruitId(const GameEngine& engine, const Faction faction,
                  const bool heroOnly) {
    const BTree::TreeSnapshot snapshot = engine.tree().snapshot();
    int bestId = 0;
    int bestScore = std::numeric_limits<int>::min();

    // Keeping every recruitment mode in the Executor interval lets the test
    // interleave Catalog, QuickClass and Custom operatives in the same B-tree
    // region. Prefer a non-full leaf that already contains an enemy so heroes
    // are guaranteed a genuine tactical opportunity once combat begins.
    for (int id = 500; id <= 799; ++id) {
        if (engine.tree().contains(id)) continue;
        int score = -std::abs(id - 550);
        if (heroOnly && id % static_cast<int>(engine.catalogs().shields().size()) == 3)
            score += 500; // Cortafuegos Cuantico in the canonical catalog.

        const BTree::InsertPrediction prediction = engine.tree().predictInsert(id);
        if (prediction.destinationNodeId) {
            const BTree::NodeSnapshot* node = snapshot.findNode(*prediction.destinationNodeId);
            if (node) {
                const bool hasEnemy = std::any_of(
                    node->operatives.begin(), node->operatives.end(),
                    [faction](const Operative& operative) {
                        return operative.alive() && operative.faction != faction;
                    });
                if (hasEnemy) score += 10'000;
                if (node->keys.size() < BTree::maxKeys) score += 2'000;
                score += static_cast<int>(node->keys.size()) * 20;
            }
        }
        if (!prediction.splitNodeIds.empty()) score -= 500;

        if (score > bestScore) {
            bestScore = score;
            bestId = id;
        }
    }
    require(bestId != 0, "No quedo un ID compatible con los tres modos de reclutamiento.");
    return bestId;
}

int fastestHeroIndex(const Catalog& catalog) {
    require(!catalog.heroes().empty(), "El catalogo de heroes esta vacio.");
    const auto fastest = std::max_element(
        catalog.heroes().begin(), catalog.heroes().end(),
        [](const UnitTemplate& left, const UnitTemplate& right) {
            return left.speed < right.speed;
        });
    return static_cast<int>(std::distance(catalog.heroes().begin(), fastest));
}

int durableSpeciesIndex(const Catalog& catalog) {
    require(!catalog.species().empty(), "El catalogo de especies esta vacio.");
    const auto durable = std::max_element(
        catalog.species().begin(), catalog.species().end(),
        [](const UnitTemplate& left, const UnitTemplate& right) {
            return left.health < right.health;
        });
    return static_cast<int>(std::distance(catalog.species().begin(), durable));
}

int strongestShieldIndex(const Catalog& catalog) {
    require(!catalog.shields().empty(), "El catalogo de escudos esta vacio.");
    const auto strongest = std::max_element(
        catalog.shields().begin(), catalog.shields().end(),
        [](const ShieldDefinition& left, const ShieldDefinition& right) {
            return left.absorption < right.absorption;
        });
    return static_cast<int>(std::distance(catalog.shields().begin(), strongest));
}

int lightestWeaponIndex(const Catalog& catalog) {
    require(!catalog.weapons().empty(), "El catalogo de armas esta vacio.");
    const auto lightest = std::min_element(
        catalog.weapons().begin(), catalog.weapons().end(),
        [](const WeaponDefinition& left, const WeaponDefinition& right) {
            return left.damage < right.damage;
        });
    return static_cast<int>(std::distance(catalog.weapons().begin(), lightest));
}

void stabilizeForTacticalCoverage(GameEngine& engine, bool& editedInWorkshop) {
    if (engine.tree().empty()) return;
    std::string error;
    const std::vector<Operative> operatives = engine.tree().inOrder();
    for (const Operative& operative : operatives) {
        EditCommand health;
        health.kind = EditKind::SetHealth;
        health.operativeId = operative.id;
        health.value = 5'000;
        require(engine.editOperative(health, &error),
                "El taller Manual rechazo SetHealth: " + error);

        EditCommand speed;
        speed.kind = EditKind::SetSpeed;
        speed.operativeId = operative.id;
        speed.value = operative.isHero ? 10'000 : 1;
        require(engine.editOperative(speed, &error),
                "El taller Manual rechazo SetSpeed: " + error);
        editedInWorkshop = true;
    }
}

struct ManualCoverage {
    std::array<int, 3> normalModes{};
    std::set<int> workshopTurns;
    std::set<int> reservedDestinations;
    std::set<int> disruptedTargetsThisTurn;
    int disruptionTurn{0};
    int heroRecruits{0};
    int trojanDecisions{0};
    int disruptionDecisions{0};
    bool editedInWorkshop{false};
};

RecruitCommand buildRecruit(const GameEngine& engine, ManualCoverage& coverage) {
    const PendingDecision& pending = engine.pendingDecision();
    RecruitCommand command;
    command.id = bestRecruitId(engine, pending.faction, pending.heroOnly);

    if (pending.heroOnly) {
        command.mode = RecruitmentMode::Catalog;
        command.templateKind = TemplateKind::Hero;
        command.templateIndex = fastestHeroIndex(engine.catalogs());
        ++coverage.heroRecruits;
        return command;
    }

    const int normalOrdinal = coverage.normalModes[0] + coverage.normalModes[1] +
                              coverage.normalModes[2];
    const int modeIndex = normalOrdinal % 3;
    ++coverage.normalModes[static_cast<std::size_t>(modeIndex)];
    if (modeIndex == 0) {
        command.mode = RecruitmentMode::Catalog;
        command.templateKind = TemplateKind::Species;
        command.templateIndex = durableSpeciesIndex(engine.catalogs());
    } else if (modeIndex == 1) {
        command.mode = RecruitmentMode::QuickClass;
        command.classType = 2; // Executor: IDs 500..799.
    } else {
        command.mode = RecruitmentMode::Custom;
        command.customName = "Hot-seat Custom";
        command.health = 5'000;
        command.attack = 1;
        command.speed = 1;
        command.weaponIndex = lightestWeaponIndex(engine.catalogs());
        command.shieldIndex = strongestShieldIndex(engine.catalogs());
    }
    return command;
}

int chooseTrojanTarget(const GameEngine& engine, const PendingDecision& pending) {
    // Prefer a firewall bearer: the choice is still resolved through the real
    // Troyano rule while preserving both factions for the following Disruption.
    for (const int id : pending.candidates) {
        const Operative* candidate = engine.tree().find(id);
        if (candidate && candidate->activeShield() &&
            candidate->activeShield()->name.find("Cortafuegos") != std::string::npos)
            return id;
    }
    require(!pending.candidates.empty(), "Troyano fue solicitado sin enemigos candidatos.");
    return pending.candidates.front();
}

int chooseDisruptionTarget(ManualCoverage& coverage, const PendingDecision& pending,
                           const int turn) {
    if (coverage.disruptionTurn != turn) {
        coverage.disruptionTurn = turn;
        coverage.disruptedTargetsThisTurn.clear();
    }
    for (const int id : pending.candidates) {
        if (!coverage.disruptedTargetsThisTurn.contains(id)) {
            coverage.disruptedTargetsThisTurn.insert(id);
            return id;
        }
    }
    require(!pending.candidates.empty(), "Disrupcion fue solicitada sin enemigos candidatos.");
    return pending.candidates.front();
}

int chooseDisruptionDestination(const GameEngine& engine, ManualCoverage& coverage) {
    const std::vector<int> free = engine.freeIds();
    for (auto iterator = free.rbegin(); iterator != free.rend(); ++iterator) {
        if (!coverage.reservedDestinations.contains(*iterator)) {
            coverage.reservedDestinations.insert(*iterator);
            return *iterator;
        }
    }
    throw std::runtime_error("No quedo un destino libre para Disrupcion.");
}

void testAuthenticManualHotSeatDriver() {
    GameEngine engine;
    require(engine.loadCatalogs(),
            "El modo Manual no pudo resolver los catalogos copiados junto al ejecutable.");

    GameConfig config;
    config.mode = GameMode::Manual;
    config.maxTurns = 8;
    config.seed = 0x5947474452415349ULL;
    engine.start(config);

    ManualCoverage coverage;
    std::string error;
    constexpr int cycleLimit = 250'000;
    int cycles = 0;
    while (!engine.gameOver() && cycles++ < cycleLimit) {
        if (engine.awaitingWorkshop()) {
            const int turn = engine.snapshot().turn;
            require(turn > 0, "El taller Manual aparecio antes del primer turno.");
            require(coverage.workshopTurns.insert(turn).second,
                    "El mismo taller Manual fue solicitado dos veces.");
            stabilizeForTacticalCoverage(engine, coverage.editedInWorkshop);
            error.clear();
            require(engine.continueWorkshop(&error),
                    "continueWorkshop rechazo el hot-seat: " + error);
        } else if (engine.hasPendingDecision()) {
            const PendingDecision pending = engine.pendingDecision();
            error.clear();
            if (pending.type == DecisionType::Recruit) {
                const RecruitCommand recruit = buildRecruit(engine, coverage);
                require(engine.validateRecruit(recruit, &error),
                        "validateRecruit rechazo una orden Manual: " + error);
                require(engine.submitRecruit(recruit, &error),
                        "submitRecruit rechazo una orden Manual: " + error);
            } else {
                TacticalCommand tactical;
                if (pending.type == DecisionType::TrojanTarget) {
                    ++coverage.trojanDecisions;
                    tactical.targetId = chooseTrojanTarget(engine, pending);
                } else if (pending.type == DecisionType::Disruption) {
                    ++coverage.disruptionDecisions;
                    tactical.targetId = chooseDisruptionTarget(
                        coverage, pending, engine.snapshot().turn);
                    tactical.destinationId = chooseDisruptionDestination(engine, coverage);
                } else {
                    throw std::runtime_error("Decision Manual publica de tipo desconocido.");
                }
                require(engine.submitTactical(tactical, &error),
                        "submitTactical rechazo la decision hot-seat: " + error);
            }
        } else {
            engine.pump();
        }

        const BTree::Validation validation = engine.tree().validate();
        require(validation.valid,
                "Una transicion Manual dejo invalido el Arbol B-4: " +
                    (validation.errors.empty() ? std::string{"sin diagnostico"}
                                               : validation.errors.front()));
    }

    require(cycles < cycleLimit, "El driver Manual excedio el limite de ciclos.");
    require(engine.gameOver(), "La partida Manual no llego a una resolucion.");
    require(!engine.hasPendingDecision(), "La victoria dejo una decision Manual pendiente.");
    require(engine.snapshot().mode == GameMode::Manual,
            "El driver abandono accidentalmente el modo Manual.");
    require(engine.victory().reason != VictoryReason::None,
            "La partida termino sin una causa de victoria.");
    require(engine.victory().winner != Faction::Neutral,
            "La partida hot-seat termino sin una faccion ganadora.");
    require(static_cast<int>(coverage.workshopTurns.size()) == engine.victory().turnsPlayed,
            "No se confirmo exactamente un Workshop por turno jugado.");
    require(coverage.editedInWorkshop,
            "El test no ejercito una edicion durante el Workshop Manual.");
    require(coverage.heroRecruits >= 2,
            "El hot-seat no recluto heroes para ambas facciones.");
    require(std::all_of(coverage.normalModes.begin(), coverage.normalModes.end(),
                        [](const int uses) { return uses > 0; }),
            "No se alternaron Catalog, QuickClass y Custom en reclutamiento Manual.");
    require(coverage.trojanDecisions > 0,
            "El flujo Manual no alcanzo una decision real de Troyano.");
    require(coverage.disruptionDecisions > 0,
            "El flujo Manual no alcanzo una decision real de Disrupcion.");

    bool victoryEvent = false;
    bool trojanResolved = false;
    bool disruptionQueued = false;
    bool disruptionApplied = false;
    for (const GameEvent& event : engine.history()) {
        victoryEvent = victoryEvent || event.type == EventType::VictoryDeclared;
        trojanResolved = trojanResolved || event.type == EventType::TrojanBlocked ||
                          event.type == EventType::OperativeConverted;
        disruptionQueued = disruptionQueued || event.type == EventType::DisruptionQueued;
        disruptionApplied = disruptionApplied ||
                            (event.type == EventType::OperativeRelocated &&
                             event.phase == GamePhase::Cleanup);
    }
    require(victoryEvent, "La partida Manual no emitio VictoryDeclared.");
    require(trojanResolved, "La eleccion de Troyano no produjo una resolucion canonica.");
    require(disruptionQueued && disruptionApplied,
            "La eleccion de Disrupcion no se encolo y aplico durante Cleanup.");
    require(engine.tree().validate().valid,
            "El Arbol B-4 final del hot-seat es invalido.");
}

} // namespace

int main() {
    try {
        testAuthenticManualHotSeatDriver();
        std::cout << "test_manual: OK\n";
        return EXIT_SUCCESS;
    } catch (const std::exception& error) {
        std::cerr << "test_manual: FAIL: " << error.what() << '\n';
        return EXIT_FAILURE;
    }
}
