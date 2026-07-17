#include "yggdrasil/ai/ai_controller.hpp"

#include <algorithm>
#include <cstdlib>
#include <limits>
#include <sstream>
#include <string_view>
#include <utility>
#include <vector>

namespace yggdrasil {
namespace {

using Score = long long;

constexpr Score kFirewallPenalty = 10'000'000;

struct TemplateChoice {
    TemplateKind kind{TemplateKind::Species};
    int index{0};
    const UnitTemplate* unit{nullptr};
    Score score{0};
};

struct IdChoice {
    int id{0};
    Score score{0};
    InsertPrediction prediction;
    int alliesAtDestination{0};
    int enemiesAtDestination{0};
};

struct TargetChoice {
    int id{0};
    Score score{0};
    bool inRoot{false};
    bool firewall{false};
    int sameFactionNeighbors{0};
};

void setError(std::string* const error, std::string message) {
    if (error != nullptr) {
        *error = std::move(message);
    }
}

template <typename T, typename ScoreFunction>
std::size_t bestIndex(const std::vector<T>& values,
                      GameEngine& engine,
                      ScoreFunction scoreFunction) {
    Score best = std::numeric_limits<Score>::lowest();
    std::vector<std::size_t> ties;
    ties.reserve(values.size());

    for (std::size_t index = 0; index < values.size(); ++index) {
        const Score score = scoreFunction(values[index]);
        if (score > best) {
            best = score;
            ties.assign(1, index);
        } else if (score == best) {
            ties.push_back(index);
        }
    }

    if (ties.size() == 1) {
        return ties.front();
    }
    const int tie = engine.randomInt(0, static_cast<int>(ties.size()) - 1);
    return ties[static_cast<std::size_t>(tie)];
}

const NodeSnapshot* findNode(const BTree::TreeSnapshot& snapshot,
                             const BTree::NodeId nodeId) {
    const auto node = std::find_if(snapshot.nodes.begin(), snapshot.nodes.end(),
                                   [nodeId](const NodeSnapshot& candidate) {
                                       return candidate.id == nodeId;
                                   });
    return node == snapshot.nodes.end() ? nullptr : &*node;
}

bool hasActiveFirewall(const Operative& operative) {
    const Shield* const shield = operative.activeShield();
    return shield != nullptr && shield->name.find("Cortafuegos") != std::string::npos;
}

Score combatImpact(const Operative& operative) {
    Score impact = static_cast<Score>(std::max(0, operative.baseHp)) * 5;
    impact += static_cast<Score>(std::max(0, operative.attack)) * 6;
    impact += static_cast<Score>(std::max(0, operative.speed)) * 3;
    if (const Weapon* const weapon = operative.activeWeapon(); weapon != nullptr) {
        impact += static_cast<Score>(std::max(0, weapon->damage)) * 2;
    }
    if (const Shield* const shield = operative.activeShield(); shield != nullptr) {
        impact += std::max(0, shield->absorption);
        impact += std::max(0, shield->durability);
    }
    if (operative.isHero) {
        impact += 600;
    }
    return impact;
}

Score templateImpact(const UnitTemplate& unit) {
    const int attack = unit.fortitude > 0 ? unit.fortitude : unit.damage;
    return static_cast<Score>(std::max(0, unit.health)) * 5
           + static_cast<Score>(std::max(0, attack)) * 6
           + static_cast<Score>(std::max(0, unit.speed)) * 3;
}

Score weaponImpact(const WeaponDefinition& weapon) {
    // The canonical engine spends 50 ammunition for every action; `use_cost`
    // is catalog flavor rather than the runtime consumption rule.
    const int affordableUses = (std::max(0, weapon.ammunition) + 49) / 50;
    return static_cast<Score>(std::max(0, weapon.damage)) * 7
           + static_cast<Score>(std::max(0, affordableUses)) * 80
           + std::max(0, weapon.ammunition) / 4;
}

Score shieldImpact(const ShieldDefinition& shield) {
    Score score = static_cast<Score>(std::max(0, shield.absorption)) * 4
                  + static_cast<Score>(std::max(0, shield.durability)) * 3
                  - static_cast<Score>(std::max(0, shield.weight)) * 2;
    if (shield.name.find("Cortafuegos") != std::string::npos) {
        score += 450; // durable protection plus immunity to an enemy hero's Trojan
    }
    return score;
}

void appendTemplates(std::vector<TemplateChoice>& output,
                     const std::vector<UnitTemplate>& templates,
                     const TemplateKind kind) {
    for (std::size_t index = 0; index < templates.size(); ++index) {
        output.push_back(TemplateChoice{kind,
                                        static_cast<int>(index),
                                        &templates[index],
                                        templateImpact(templates[index])});
    }
}

std::vector<TemplateChoice> legalTemplates(const GameEngine& engine,
                                           const PendingDecision& decision) {
    std::vector<TemplateChoice> choices;
    const Catalog& catalog = engine.catalogs();

    if (decision.heroOnly) {
        appendTemplates(choices, catalog.heroes(), TemplateKind::Hero);
        return choices;
    }

    appendTemplates(choices, catalog.species(), TemplateKind::Species);
    if (decision.recruitmentTier >= 2) {
        appendTemplates(choices, catalog.characters(), TemplateKind::Character);
    }
    return choices;
}

std::pair<int, int> factionCounts(const NodeSnapshot* const node,
                                  const Faction faction) {
    int allies = 0;
    int enemies = 0;
    if (node == nullptr) {
        return {allies, enemies};
    }
    for (const Operative& operative : node->operatives) {
        if (!operative.alive()) {
            continue;
        }
        if (operative.faction == faction) {
            ++allies;
        } else if (operative.faction != Faction::Neutral) {
            ++enemies;
        }
    }
    return {allies, enemies};
}

IdChoice scoreRecruitId(const GameEngine& engine,
                        const int id,
                        const Faction faction,
                        const BTree::TreeSnapshot& snapshot) {
    IdChoice choice;
    choice.id = id;
    choice.prediction = engine.tree().predictInsert(id);
    if (choice.prediction.duplicate) {
        choice.score = std::numeric_limits<Score>::lowest();
        return choice;
    }

    const NodeSnapshot* destination = nullptr;
    if (choice.prediction.destinationNodeId.has_value()) {
        destination = findNode(snapshot, *choice.prediction.destinationNodeId);
    }
    const auto [allies, enemies] = factionCounts(destination, faction);
    choice.alliesAtDestination = allies;
    choice.enemiesAtDestination = enemies;

    // Immediate conflict is useful: the new unit can pressure enemy keys in
    // its real destination node instead of merely growing a safe branch.
    choice.score += static_cast<Score>(enemies) * 900;
    choice.score += static_cast<Score>(allies) * 90;
    if (enemies > 0 && allies > 0) {
        choice.score += 350;
    }

    if (destination != nullptr && snapshot.rootId == destination->id) {
        choice.score += 500;
        if (enemies > allies) {
            choice.score += 500; // challenge enemy root dominance now
        }
    }

    // A split of an enemy-heavy node disrupts a favorable cluster. Splitting
    // an allied-only node is mildly discouraged, especially at the root.
    for (const BTree::NodeId splitId : choice.prediction.splitNodeIds) {
        const auto [splitAllies, splitEnemies] = factionCounts(findNode(snapshot, splitId), faction);
        if (splitEnemies > splitAllies) {
            choice.score += 420;
        } else if (splitEnemies > 0) {
            choice.score += 220;
        } else if (splitAllies > 0) {
            choice.score -= 120;
        }
    }
    if (choice.prediction.rootSplit) {
        const NodeSnapshot* root = snapshot.rootId.has_value()
                                       ? findNode(snapshot, *snapshot.rootId)
                                       : nullptr;
        const auto [rootAllies, rootEnemies] = factionCounts(root, faction);
        choice.score += rootEnemies >= rootAllies ? 300 : -180;
    }

    // In otherwise equivalent branches, stay close to an enemy key and away
    // from the extreme edges of the ID space. This preserves tactical density
    // without hard-coding a single insertion sequence.
    int nearestEnemyDistance = 1'000;
    for (const Operative& operative : engine.tree().inOrder()) {
        if (operative.alive() && operative.faction != faction
            && operative.faction != Faction::Neutral) {
            nearestEnemyDistance = std::min(nearestEnemyDistance, std::abs(id - operative.id));
        }
    }
    if (nearestEnemyDistance < 1'000) {
        choice.score += 220 - std::min(220, nearestEnemyDistance);
    }
    choice.score += std::min(id - 1, 999 - id) / 20;
    return choice;
}

TargetChoice scoreTarget(const GameEngine& engine,
                         const PendingDecision& decision,
                         const int id,
                         const bool disruption) {
    TargetChoice choice;
    choice.id = id;
    const Operative* const target = engine.tree().find(id);
    if (target == nullptr || !target->alive() || target->faction == decision.faction) {
        choice.score = std::numeric_limits<Score>::lowest();
        return choice;
    }

    choice.score = combatImpact(*target);
    choice.firewall = hasActiveFirewall(*target);

    const BTree::TreeSnapshot snapshot = engine.tree().snapshot();
    const std::optional<BTree::NodeId> nodeId = engine.tree().nodeIdFor(id);
    const NodeSnapshot* node = nodeId.has_value() ? findNode(snapshot, *nodeId) : nullptr;
    choice.inRoot = node != nullptr && snapshot.rootId == node->id;
    if (choice.inRoot) {
        choice.score += disruption ? 2'200 : 1'300;
    }

    if (node != nullptr) {
        for (const Operative& neighbor : node->operatives) {
            if (neighbor.id != id && neighbor.alive()
                && neighbor.faction == target->faction) {
                ++choice.sameFactionNeighbors;
            }
        }
    }
    if (disruption) {
        // Pulling a key out of an enemy-only/root cluster is the main
        // structural purpose of Disruption.
        choice.score += static_cast<Score>(choice.sameFactionNeighbors) * 650;
    } else if (choice.firewall) {
        // A blocked Trojan is legal but strategically wasteful. The penalty is
        // intentionally larger than any normal stat score, so it is selected
        // only when every legal target is protected.
        choice.score -= kFirewallPenalty;
    }
    return choice;
}

IdChoice scoreDisruptionDestination(const GameEngine& engine,
                                    const PendingDecision& decision,
                                    const TargetChoice& target,
                                    const int id) {
    IdChoice choice;
    choice.id = id;
    const BTree::RelocationPrediction relocation =
        engine.tree().predictRelocation(target.id, id);
    choice.prediction = relocation.insertion;
    if (relocation.sourceMissing || choice.prediction.duplicate) {
        choice.score = std::numeric_limits<Score>::lowest();
        return choice;
    }
    const BTree::TreeSnapshot& snapshot = relocation.afterErase;

    const NodeSnapshot* destination = nullptr;
    if (choice.prediction.destinationNodeId.has_value()) {
        destination = findNode(snapshot, *choice.prediction.destinationNodeId);
    }
    const auto [allies, enemies] = factionCounts(destination, decision.faction);
    choice.alliesAtDestination = allies;
    choice.enemiesAtDestination = enemies;

    // Here "allies" are allies of the attacking hero. Moving the enemy beside
    // them creates pressure; moving it into an enemy cluster would improve the
    // opponent's structure and is therefore penalized.
    choice.score += static_cast<Score>(allies) * 850;
    choice.score -= static_cast<Score>(enemies) * 500;
    if (allies > 0 && enemies > 0) {
        choice.score += 250;
    }

    if (destination != nullptr && snapshot.rootId == destination->id) {
        choice.score += allies > enemies ? 700 : -300;
    }

    for (const BTree::NodeId splitId : choice.prediction.splitNodeIds) {
        const auto [splitAllies, splitEnemies] = factionCounts(findNode(snapshot, splitId),
                                                               decision.faction);
        if (splitEnemies > splitAllies) {
            choice.score += 300; // fracture a favorable enemy node
        } else if (splitAllies > 0) {
            choice.score += 100;
        }
    }
    if (choice.prediction.rootSplit) {
        choice.score += 180;
    }

    // Prefer a different region of the key space, which makes it less likely
    // that the relocated target remains with its former same-faction peers.
    choice.score += std::min(500, std::abs(id - target.id));
    return choice;
}

int chooseDefinitionIndex(const std::vector<WeaponDefinition>& values,
                          GameEngine& engine) {
    if (values.empty()) {
        return 0;
    }
    std::vector<int> indices(values.size());
    for (std::size_t index = 0; index < values.size(); ++index) {
        indices[index] = static_cast<int>(index);
    }
    return indices[bestIndex(indices, engine, [&values](const int index) {
        return weaponImpact(values[static_cast<std::size_t>(index)]);
    })];
}

int chooseDefinitionIndex(const std::vector<ShieldDefinition>& values,
                          GameEngine& engine) {
    if (values.empty()) {
        return 0;
    }
    std::vector<int> indices(values.size());
    for (std::size_t index = 0; index < values.size(); ++index) {
        indices[index] = static_cast<int>(index);
    }
    return indices[bestIndex(indices, engine, [&values](const int index) {
        return shieldImpact(values[static_cast<std::size_t>(index)]);
    })];
}

std::string templateKindText(const TemplateKind kind) {
    switch (kind) {
    case TemplateKind::Species: return "especie";
    case TemplateKind::Character: return "personaje";
    case TemplateKind::Hero: return "heroe";
    }
    return "plantilla";
}

} // namespace

bool AIController::resolve(GameEngine& engine, std::string* const error) {
    if (error != nullptr) {
        error->clear();
    }
    lastExplanation_.clear();

    if (!engine.hasPendingDecision()) {
        setError(error, "La IA no tiene una decision pendiente que resolver.");
        return false;
    }

    // Copy it: a successful submit deliberately clears the engine's pending
    // object, while the explanation still needs the original metadata.
    const PendingDecision decision = engine.pendingDecision();

    switch (decision.type) {
    case DecisionType::Recruit: {
        std::vector<TemplateChoice> templates = legalTemplates(engine, decision);
        std::vector<int> freeIds = engine.freeIds();
        std::sort(freeIds.begin(), freeIds.end());
        freeIds.erase(std::unique(freeIds.begin(), freeIds.end()), freeIds.end());

        if (templates.empty()) {
            setError(error, "No hay plantillas permitidas para esta fase de reclutamiento.");
            return false;
        }
        if (freeIds.empty()) {
            setError(error, "No quedan IDs libres para reclutar un operativo.");
            return false;
        }

        const std::size_t templateIndex = bestIndex(
            templates, engine, [](const TemplateChoice& choice) { return choice.score; });
        const TemplateChoice& selectedTemplate = templates[templateIndex];

        const BTree::TreeSnapshot snapshot = engine.tree().snapshot();
        std::vector<IdChoice> ids;
        ids.reserve(freeIds.size());
        for (const int id : freeIds) {
            ids.push_back(scoreRecruitId(engine, id, decision.faction, snapshot));
        }
        const IdChoice& selectedId = ids[bestIndex(
            ids, engine, [](const IdChoice& choice) { return choice.score; })];
        if (selectedId.score == std::numeric_limits<Score>::lowest()) {
            setError(error, "No se encontro un ID de reclutamiento estructuralmente valido.");
            return false;
        }

        RecruitCommand command;
        command.mode = RecruitmentMode::Catalog;
        command.id = selectedId.id;
        command.templateKind = selectedTemplate.kind;
        command.templateIndex = selectedTemplate.index;
        command.weaponIndex = chooseDefinitionIndex(engine.catalogs().weapons(), engine);
        command.shieldIndex = chooseDefinitionIndex(engine.catalogs().shields(), engine);

        std::string validationError;
        if (!engine.validateRecruit(command, &validationError)) {
            setError(error, "La IA genero un reclutamiento invalido: " + validationError);
            return false;
        }

        std::ostringstream explanation;
        explanation << "Recluta " << selectedTemplate.unit->name << " ("
                    << templateKindText(selectedTemplate.kind) << ", impacto "
                    << selectedTemplate.score << ") con ID " << selectedId.id
                    << ": destino con " << selectedId.alliesAtDestination << " aliado(s) y "
                    << selectedId.enemiesAtDestination << " enemigo(s)";
        if (!selectedId.prediction.splitNodeIds.empty()) {
            explanation << ", provoca " << selectedId.prediction.splitNodeIds.size()
                        << " split(s) consciente(s)";
        }
        if (selectedId.prediction.rootSplit) {
            explanation << " incluido split de raiz";
        }
        explanation << ".";
        lastExplanation_ = explanation.str();

        if (!engine.submitRecruit(command, error)) {
            lastExplanation_ = "Fallo al ejecutar: " + lastExplanation_;
            return false;
        }
        return true;
    }

    case DecisionType::TrojanTarget: {
        if (decision.candidates.empty()) {
            setError(error, "El Troyano no tiene objetivos legales.");
            return false;
        }

        std::vector<int> candidateIds = decision.candidates;
        std::sort(candidateIds.begin(), candidateIds.end());
        candidateIds.erase(std::unique(candidateIds.begin(), candidateIds.end()),
                           candidateIds.end());
        std::vector<TargetChoice> targets;
        targets.reserve(candidateIds.size());
        for (const int id : candidateIds) {
            targets.push_back(scoreTarget(engine, decision, id, false));
        }
        const TargetChoice& target = targets[bestIndex(
            targets, engine, [](const TargetChoice& choice) { return choice.score; })];
        if (target.score == std::numeric_limits<Score>::lowest()) {
            setError(error, "Los objetivos de Troyano dejaron de ser legales.");
            return false;
        }

        const int unprotectedAlternatives = static_cast<int>(std::count_if(
            targets.begin(), targets.end(), [](const TargetChoice& choice) {
                return !choice.firewall
                       && choice.score != std::numeric_limits<Score>::lowest();
            }));

        std::ostringstream explanation;
        explanation << "Troyano contra ID " << target.id << " por impacto " << target.score;
        if (target.inRoot) {
            explanation << " y presion de raiz";
        }
        if (unprotectedAlternatives > 0) {
            explanation << "; se evitan objetivos con Cortafuegos activo";
        } else if (target.firewall) {
            explanation << "; todos los objetivos legales tienen Cortafuegos activo";
        }
        explanation << ".";
        lastExplanation_ = explanation.str();

        TacticalCommand command;
        command.targetId = target.id;
        if (!engine.submitTactical(command, error)) {
            lastExplanation_ = "Fallo al ejecutar: " + lastExplanation_;
            return false;
        }
        return true;
    }

    case DecisionType::Disruption: {
        if (decision.candidates.empty()) {
            setError(error, "Disrupcion no tiene objetivos legales.");
            return false;
        }
        std::vector<int> freeIds = engine.freeIds();
        std::sort(freeIds.begin(), freeIds.end());
        freeIds.erase(std::unique(freeIds.begin(), freeIds.end()), freeIds.end());
        if (freeIds.empty()) {
            setError(error, "Disrupcion no tiene un ID de destino libre.");
            return false;
        }

        std::vector<int> candidateIds = decision.candidates;
        std::sort(candidateIds.begin(), candidateIds.end());
        candidateIds.erase(std::unique(candidateIds.begin(), candidateIds.end()),
                           candidateIds.end());
        std::vector<TargetChoice> targets;
        targets.reserve(candidateIds.size());
        for (const int id : candidateIds) {
            targets.push_back(scoreTarget(engine, decision, id, true));
        }
        const TargetChoice& target = targets[bestIndex(
            targets, engine, [](const TargetChoice& choice) { return choice.score; })];
        if (target.score == std::numeric_limits<Score>::lowest()) {
            setError(error, "Los objetivos de Disrupcion dejaron de ser legales.");
            return false;
        }

        std::vector<IdChoice> destinations;
        destinations.reserve(freeIds.size());
        for (const int id : freeIds) {
            destinations.push_back(
                scoreDisruptionDestination(engine, decision, target, id));
        }
        const IdChoice& destination = destinations[bestIndex(
            destinations, engine, [](const IdChoice& choice) { return choice.score; })];
        if (destination.score == std::numeric_limits<Score>::lowest()) {
            setError(error, "No se encontro un destino estructural valido para Disrupcion.");
            return false;
        }

        std::ostringstream explanation;
        explanation << "Disrupcion mueve el ID " << target.id;
        if (target.inRoot) {
            explanation << " fuera de la raiz";
        }
        if (target.sameFactionNeighbors > 0) {
            explanation << " y rompe su grupo de " << target.sameFactionNeighbors
                        << " aliado(s)";
        }
        explanation << " hacia el ID " << destination.id << ", junto a "
                    << destination.alliesAtDestination << " rival(es) y "
                    << destination.enemiesAtDestination << " aliado(s) propios";
        if (!destination.prediction.splitNodeIds.empty()) {
            explanation << ", con prediccion de "
                        << destination.prediction.splitNodeIds.size()
                        << " split(s) estructural(es) tras la reubicacion";
        }
        explanation << ".";
        lastExplanation_ = explanation.str();

        TacticalCommand command;
        command.targetId = target.id;
        command.destinationId = destination.id;
        if (!engine.submitTactical(command, error)) {
            lastExplanation_ = "Fallo al ejecutar: " + lastExplanation_;
            return false;
        }
        return true;
    }

    case DecisionType::None:
        break;
    }

    setError(error, "Tipo de decision de IA desconocido.");
    return false;
}

bool AIController::runHeadless(GameEngine& engine,
                               const std::size_t maxCycles,
                               std::string* const error) {
    if (error != nullptr) {
        error->clear();
    }
    if (maxCycles == 0) {
        setError(error, "El limite de ciclos de la simulacion debe ser mayor que cero.");
        return false;
    }

    for (std::size_t cycle = 0; cycle < maxCycles; ++cycle) {
        if (engine.gameOver()) {
            return true;
        }
        if (engine.hasPendingDecision()) {
            if (!resolve(engine, error)) {
                return false;
            }
        } else if (engine.awaitingWorkshop()) {
            if (!engine.continueWorkshop(error)) {
                return false;
            }
        } else {
            engine.pump();
        }
    }

    if (engine.gameOver()) {
        return true;
    }
    setError(error, "La simulacion excedio el limite de " + std::to_string(maxCycles)
                        + " ciclos sin alcanzar una victoria.");
    return false;
}

} // namespace yggdrasil
