#include "yggdrasil/core/game_engine.hpp"

#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>
#include <sstream>
#include <unordered_map>

namespace yggdrasil {
namespace {

constexpr int kInsertionLimit = 60;
constexpr int kMinimumId = 1;
constexpr int kMaximumId = 999;
constexpr int kMaximumEditableStat = 100'000;

std::string joinIds(const std::vector<int>& ids) {
    std::ostringstream output;
    for (std::size_t index = 0; index < ids.size(); ++index) {
        if (index != 0) output << " > ";
        output << ids[index];
    }
    return output.str();
}

std::size_t positiveModulo(const int value, const std::size_t modulus) {
    if (modulus == 0) return 0;
    const auto signedModulus = static_cast<int>(modulus);
    const int result = value % signedModulus;
    return static_cast<std::size_t>(result < 0 ? result + signedModulus : result);
}

} // namespace

GameEngine::GameEngine() {
    tree_.setEventSink([this](const BTreeEvent& structural) {
        switch (structural.type) {
        case BTreeEventType::OperativeInserted:
            emit(EventType::OperativeInserted, "Operativo insertado",
                 "La clave " + std::to_string(structural.key) + " entro al Arbol B-4.",
                 Faction::Neutral, structural.key, 0, structural.nodeId);
            break;
        case BTreeEventType::NodeSplit:
            emit(EventType::NodeSplit, "Fractura de nodo",
                 "El nodo rebosado promovio la mediana " + std::to_string(structural.promotedKey) + ".",
                 Faction::Neutral, structural.promotedKey, 0, structural.nodeId, 0, 0,
                 structural.keys);
            break;
        case BTreeEventType::OperativeErased:
            emit(EventType::OperativeRemoved, "Clave retirada",
                 "El operativo " + std::to_string(structural.key) + " salio del Arbol B-4.",
                 Faction::Neutral, structural.key, 0, structural.nodeId);
            break;
        case BTreeEventType::BorrowedFromRight:
        case BTreeEventType::BorrowedFromLeft:
            emit(EventType::NodeBorrowed, "Prestamo estructural",
                 structural.type == BTreeEventType::BorrowedFromRight
                     ? "Un hermano derecho presto una clave."
                     : "Un hermano izquierdo presto una clave.",
                 Faction::Neutral, structural.key, 0, structural.nodeId);
            break;
        case BTreeEventType::NodesMerged:
            emit(EventType::NodesMerged, "Fusion de estaciones",
                 "Dos estaciones se fusionaron para reparar un underflow.",
                 Faction::Neutral, structural.key, 0, structural.nodeId);
            break;
        case BTreeEventType::RootReduced:
            emit(EventType::RootReduced, "Reduccion de raiz",
                 "La raiz vacia cedio su lugar al unico descendiente.",
                 Faction::Neutral, 0, 0, structural.nodeId);
            break;
        case BTreeEventType::DuplicateRejected:
            emit(EventType::Warning, "ID duplicado rechazado",
                 "La clave " + std::to_string(structural.key) + " ya existe.");
            break;
        case BTreeEventType::EraseMissing:
            emit(EventType::Warning, "ID ausente",
                 "No se encontro la clave " + std::to_string(structural.key) + " para borrar.");
            break;
        case BTreeEventType::NodeCreated:
        case BTreeEventType::TreeCleared:
            break;
        }
    });
}

bool GameEngine::loadCatalogs(const std::filesystem::path& explicitDataDirectory,
                              const std::filesystem::path& executablePath) {
    std::filesystem::path executableDirectory = executablePath;
    if (!executablePath.empty()) {
        std::error_code error;
        if (!std::filesystem::is_directory(executablePath, error)) {
            executableDirectory = executablePath.parent_path();
        }
    }
    return catalogs_.load(explicitDataDirectory, executableDirectory);
}

const std::vector<std::string>& GameEngine::catalogDiagnostics() const noexcept {
    return catalogs_.diagnostics();
}

bool GameEngine::catalogsReady() const noexcept { return catalogs_.loaded(); }

void GameEngine::resetState() {
    tree_.clear();
    tree_.clearEvents();
    eventQueue_.clear();
    history_.clear();
    pending_ = {};
    victory_ = {};
    statistics_ = {};
    nextEventSequence_ = 1;
    stage_ = Stage::Idle;
    phase_ = GamePhase::Setup;
    turn_ = 0;
    preCombatTurns_ = 4;
    startingFaction_ = Faction::Neutral;
    activeFaction_ = Faction::Neutral;
    rootDominanceFaction_ = Faction::Neutral;
    rootDominanceTurns_ = 0;
    insertionRoll_ = 0;
    remainingInsertions_ = 0;
    totalInsertions_ = 0;
    recruitmentTier_ = 1;
    heroTurn_ = false;
    combatActions_.clear();
    combatActionIndex_ = 0;
    combatNodeOrder_.clear();
    combatNodeIndex_ = 0;
    awaitingTacticalAction_.reset();
    relocations_.clear();
}

void GameEngine::start(GameConfig config) {
    resetState();
    config.maxTurns = std::clamp(config.maxTurns, 2, 60);
    if (config.maxTurns % 2 != 0) ++config.maxTurns;
    config.visualSpeed = std::clamp(config.visualSpeed, 0.5F, 32.0F);
    config_ = config;
    preCombatTurns_ = config_.maxTurns <= 4 ? config_.maxTurns / 2 : 4;
    rng_.seed(config_.seed);
    startingFaction_ = randomInt(1, 2) == 1 ? Faction::Neon : Faction::Omega;
    phase_ = GamePhase::TurnStart;
    emit(EventType::SessionStarted, "Operacion Yggdrasil iniciada",
         "Semilla determinista: " + std::to_string(config_.seed));
    emit(EventType::CoinFlipped, "Moneda orbital lanzada",
         factionName(startingFaction_) + " obtuvo el primer turno.", startingFaction_);
    if (!catalogs_.loaded()) {
        emit(EventType::Warning, "Catalogos no disponibles",
             "La partida no podra reclutar hasta cargar los cinco archivos de data.");
    }
    stage_ = Stage::ReadyTurn;
}

void GameEngine::pump() {
    if (pending_ || stage_ == Stage::Finished || stage_ == Stage::Idle) return;
    switch (stage_) {
    case Stage::ReadyTurn: beginTurn(); break;
    case Stage::Workshop:
        if (config_.mode == GameMode::AiVsAi) beginRecruitment();
        break;
    case Stage::Recruiting:
        if (remainingInsertions_ > 0 && totalInsertions_ < kInsertionLimit) requestRecruitment();
        else stage_ = Stage::CombatSetup;
        break;
    case Stage::CombatSetup: setupCombat(); break;
    case Stage::CombatActions: processNextCombatAction(); break;
    case Stage::Cleanup: cleanupTurn(); break;
    case Stage::FinishTurn: finishTurn(); break;
    case Stage::Idle:
    case Stage::Finished:
        break;
    }
}

void GameEngine::beginTurn() {
    ++turn_;
    activeFaction_ = (turn_ % 2 == 1) ? startingFaction_ : opposingFaction(startingFaction_);
    recruitmentTier_ = turn_ <= 2 ? 1 : 2;
    heroTurn_ = isHeroTurn(turn_);
    setPhase(GamePhase::Workshop, "El taller preturno esta disponible.");
    emit(EventType::TurnStarted, "Turno " + std::to_string(turn_),
         factionName(activeFaction_) + " controla el reclutamiento.", activeFaction_);

    stage_ = Stage::Workshop;
    if (config_.mode == GameMode::AiVsAi) beginRecruitment();
}

void GameEngine::beginRecruitment() {
    if (stage_ != Stage::Workshop) return;

    if (turn_ >= 4 && turn_ % 2 == 0) rearmUnarmedOperatives();

    insertionRoll_ = heroTurn_ ? 1 : randomInt(1, 3);
    remainingInsertions_ = std::min(insertionRoll_, kInsertionLimit - totalInsertions_);
    if (heroTurn_) {
        emit(EventType::Information, "Ventana de heroe",
             "Este turno admite exactamente un heroe de catalogo.", activeFaction_);
    } else {
        emit(EventType::DieRolled, "Dado de insercion",
             "Resultado: " + std::to_string(insertionRoll_) + " operativo(s).",
             activeFaction_, 0, 0, 0, insertionRoll_);
    }
    setPhase(GamePhase::Recruitment);
    stage_ = Stage::Recruiting;
    if (remainingInsertions_ > 0) requestRecruitment();
}

bool GameEngine::continueWorkshop(std::string* error) {
    if (error) error->clear();
    if (config_.mode != GameMode::Manual || stage_ != Stage::Workshop ||
        phase_ != GamePhase::Workshop) {
        if (error) *error = "No hay un taller preturno esperando confirmacion.";
        return false;
    }
    beginRecruitment();
    return true;
}

void GameEngine::requestRecruitment() {
    pending_ = {};
    pending_.type = DecisionType::Recruit;
    pending_.faction = activeFaction_;
    pending_.remainingInsertions = remainingInsertions_;
    pending_.recruitmentTier = recruitmentTier_;
    pending_.heroOnly = heroTurn_;
    pending_.prompt = heroTurn_ ? "Selecciona heroe e ID libre" : "Configura el siguiente operativo";
    emit(EventType::DecisionRequested, "Decision de reclutamiento", pending_.prompt,
         activeFaction_, 0, 0, 0, remainingInsertions_);
}

bool GameEngine::validateRecruit(const RecruitCommand& command, std::string* error) const {
    auto fail = [&](std::string message) {
        if (error) *error = std::move(message);
        return false;
    };
    if (pending_.type != DecisionType::Recruit) return fail("No hay una insercion pendiente.");
    if (!catalogs_.loaded()) return fail("Los catalogos no estan cargados.");
    if (command.id < kMinimumId || command.id > kMaximumId)
        return fail("El ID debe estar entre 1 y 999.");
    if (tree_.contains(command.id)) return fail("Ese ID ya esta ocupado.");

    if (pending_.heroOnly) {
        if (command.mode != RecruitmentMode::Catalog || command.templateKind != TemplateKind::Hero)
            return fail("Un turno de heroe solo admite heroes del catalogo.");
        if (command.templateIndex < 0 ||
            command.templateIndex >= static_cast<int>(catalogs_.heroes().size()))
            return fail("Heroe fuera de rango.");
        return true;
    }

    if (command.mode == RecruitmentMode::Catalog) {
        if (command.templateKind == TemplateKind::Hero)
            return fail("Los heroes solo entran en sus turnos especiales.");
        if (command.templateKind == TemplateKind::Character && pending_.recruitmentTier < 2)
            return fail("Los personajes elite se habilitan desde el turno global 3.");
        const auto& pool = command.templateKind == TemplateKind::Species
                               ? catalogs_.species() : catalogs_.characters();
        if (command.templateIndex < 0 || command.templateIndex >= static_cast<int>(pool.size()))
            return fail("Plantilla fuera de rango.");
    } else if (command.mode == RecruitmentMode::QuickClass) {
        if (command.classType < 1 || command.classType > 3)
            return fail("La clase debe ser Juggernaut, Ejecutor o Hacker.");
        const bool inRange = command.classType == 1 ? command.id >= 800
                           : command.classType == 2 ? command.id >= 500 && command.id <= 799
                                                    : command.id <= 499;
        if (!inRange) return fail("El ID no pertenece al rango canonico de esa clase.");
    } else {
        if (command.customName.empty() || command.customName.size() > 32)
            return fail("El nombre personalizado debe tener de 1 a 32 caracteres.");
        if (command.health < 1 || command.health > kMaximumEditableStat ||
            command.attack < 1 || command.attack > kMaximumEditableStat ||
            command.speed < 0 || command.speed > kMaximumEditableStat)
            return fail("HP/ataque deben ser 1..100000 y rapidez 0..100000.");
        if (command.weaponIndex < 0 || command.weaponIndex >= static_cast<int>(catalogs_.weapons().size()))
            return fail("Arma personalizada fuera de rango.");
        if (command.shieldIndex < 0 || command.shieldIndex >= static_cast<int>(catalogs_.shields().size()))
            return fail("Escudo personalizado fuera de rango.");
    }
    return true;
}

bool GameEngine::submitRecruit(const RecruitCommand& command, std::string* error) {
    if (!validateRecruit(command, error)) return false;
    Operative operative = createOperative(command);
    const int insertedId = operative.id;
    const std::string insertedName = operative.name;
    emit(EventType::OperativeCreated, "Operativo materializado",
         insertedName + " recibio el ID " + std::to_string(insertedId) + ".",
         activeFaction_, insertedId);
    if (!tree_.insert(std::move(operative))) {
        if (error) *error = "El Arbol B-4 rechazo la insercion.";
        return false;
    }
    ++totalInsertions_;
    --remainingInsertions_;
    pending_ = {};
    if (remainingInsertions_ > 0 && totalInsertions_ < kInsertionLimit) requestRecruitment();
    else stage_ = Stage::CombatSetup;
    return true;
}

Operative GameEngine::createOperative(const RecruitCommand& command) {
    if (command.mode == RecruitmentMode::Catalog) {
        const UnitTemplate* unit = nullptr;
        bool hero = false;
        if (command.templateKind == TemplateKind::Species)
            unit = &catalogs_.species()[static_cast<std::size_t>(command.templateIndex)];
        else if (command.templateKind == TemplateKind::Character)
            unit = &catalogs_.characters()[static_cast<std::size_t>(command.templateIndex)];
        else {
            unit = &catalogs_.heroes()[static_cast<std::size_t>(command.templateIndex)];
            hero = true;
        }
        Operative operative(command.id, unit->name, activeFaction_, unit->health, 0,
                            unit->fortitude, unit->damage, unit->speed, hero);
        operative.pushShield(shieldFromCatalog(command.id));
        if (hero) {
            operative.enqueueWeapon(makeHeroAbility("TROYANO", operative));
            operative.enqueueWeapon(makeHeroAbility("DISRUPCION", operative));
        } else {
            operative.enqueueWeapon(weaponFromCatalog(command.id));
        }
        return operative;
    }

    if (command.mode == RecruitmentMode::QuickClass) {
        static constexpr const char* names[3][4] = {
            {"Titan-Alpha", "Titan-Beta", "Titan-Gamma", "Titan-Delta"},
            {"Blade-01", "Blade-02", "Blade-03", "Blade-04"},
            {"Ghost-X", "Ghost-Y", "Ghost-Z", "Ghost-W"},
        };
        const int hp = command.classType == 1 ? 150 : command.classType == 2 ? 100 : 60;
        const int attack = command.classType == 1 ? 15 : command.classType == 2 ? 30 : 10;
        const int speed = command.classType == 1 ? 30 : command.classType == 2 ? 50 : 70;
        const std::string classLabel = command.classType == 1 ? " [Juggernaut]"
                                     : command.classType == 2 ? " [Ejecutor]" : " [Hacker]";
        const std::string name = std::string(names[command.classType - 1][randomInt(0, 3)]) + classLabel;
        Operative operative(command.id, name, activeFaction_, hp, command.classType,
                            activeFaction_ == Faction::Neon ? attack : 0,
                            activeFaction_ == Faction::Omega ? attack : 0, speed, false);
        if (command.classType != 3) operative.pushShield(makeClassShield(command.classType));
        operative.enqueueWeapon(makeSimpleBlast());
        return operative;
    }

    Operative operative(command.id, command.customName, activeFaction_, command.health, 0,
                        activeFaction_ == Faction::Neon ? command.attack : 0,
                        activeFaction_ == Faction::Omega ? command.attack : 0,
                        command.speed, false);
    operative.attack = command.attack;
    operative.enqueueWeapon(weaponFromCatalog(command.weaponIndex));
    operative.pushShield(shieldFromCatalog(command.shieldIndex));
    return operative;
}

Weapon GameEngine::weaponFromCatalog(const int index) const {
    if (catalogs_.weapons().empty()) return {};
    const auto& definition = catalogs_.weapons()[positiveModulo(index, catalogs_.weapons().size())];
    return {definition.id, definition.name, definition.type, definition.damage,
            definition.ammunition, definition.use_cost};
}

Shield GameEngine::shieldFromCatalog(const int index) const {
    if (catalogs_.shields().empty()) return {};
    const auto& definition = catalogs_.shields()[positiveModulo(index, catalogs_.shields().size())];
    return {definition.id, definition.name, definition.type, definition.absorption,
            definition.durability, definition.weight};
}

Weapon GameEngine::makeHeroAbility(std::string name, const Operative& owner) {
    int id = 0;
    do {
        id = randomInt(1000, 9999);
    } while (std::any_of(owner.weapons.begin(), owner.weapons.end(),
                         [id](const Weapon& weapon) { return weapon.id == id; }));
    return {id, name, name, 0, 50, 0};
}

Weapon GameEngine::makeSimpleBlast() {
    const int selection = randomInt(0, 2);
    if (selection == 0) return {randomInt(1000, 9999), "LASER", "LASER", 100, 75, 20};
    if (selection == 1) return {randomInt(1000, 9999), "EMP", "EMP", 120, 50, 30};
    return {randomInt(1000, 9999), "RACIMO", "RACIMO", 80, 150, 15};
}

Shield GameEngine::makeClassShield(const int classType) {
    if (classType == 1)
        return {randomInt(1000, 9999), "FISICO", "FISICO", 30, 50, 25};
    return {randomInt(1000, 9999), "ANTIPLASMA", "ANTIPLASMA", 40, 30, 40};
}

void GameEngine::setupCombat() {
    clearConversionFlags();
    relocations_.clear();
    if (turn_ <= preCombatTurns_) {
        setPhase(GamePhase::PreCombat, "La red sigue en fase de despliegue; no hay ataques.");
        emit(EventType::Information, "Pre-combate",
             "Turno de inserciones sin batalla.", activeFaction_);
        stage_ = Stage::Cleanup;
        return;
    }
    setPhase(GamePhase::Combat);
    emit(EventType::CombatStarted, "Combate iniciado",
         "Ambas facciones actuan por rapidez; el desempate favorece al menor ID.");
    buildCombatActions();
    stage_ = Stage::CombatActions;
}

void GameEngine::buildCombatActions() {
    combatActions_.clear();
    combatActionIndex_ = 0;
    combatNodeOrder_.clear();
    combatNodeIndex_ = 0;
    const auto snapshot = tree_.snapshot();
    if (!snapshot.rootId) return;
    std::unordered_map<BTree::NodeId, const BTree::NodeSnapshot*> nodes;
    for (const auto& node : snapshot.nodes) nodes[node.id] = &node;
    std::function<void(BTree::NodeId)> visit = [&](const BTree::NodeId id) {
        const auto found = nodes.find(id);
        if (found == nodes.end()) return;
        const auto& node = *found->second;
        if (!node.children.empty()) visit(node.children.front());
        combatNodeOrder_.push_back(id);
        for (std::size_t child = 1; child < node.children.size(); ++child) visit(node.children[child]);
    };
    visit(*snapshot.rootId);
}

bool GameEngine::nodeInConflict(const BTree::NodeSnapshot& node) const {
    Faction first = Faction::Neutral;
    for (const auto& operative : node.operatives) {
        if (!operative.alive()) continue;
        if (first == Faction::Neutral) first = operative.faction;
        else if (operative.faction != first) return true;
    }
    return false;
}

void GameEngine::processNextCombatAction() {
    while (combatActionIndex_ >= combatActions_.size()) {
        if (combatNodeIndex_ >= combatNodeOrder_.size()) {
            stage_ = Stage::Cleanup;
            return;
        }
        const auto nodeId = combatNodeOrder_[combatNodeIndex_++];
        const auto node = tree_.node(nodeId);
        if (!node) continue;
        const bool conflict = nodeInConflict(*node);
        auto operatives = node->operatives;
        std::stable_sort(operatives.begin(), operatives.end(), [](const Operative& left, const Operative& right) {
            if (left.speed != right.speed) return left.speed > right.speed;
            return left.id < right.id;
        });
        combatActions_.clear();
        std::vector<int> initiative;
        for (const auto& operative : operatives) {
            combatActions_.push_back({operative.id, nodeId, conflict});
            initiative.push_back(operative.id);
        }
        combatActionIndex_ = 0;
        if (!initiative.empty()) {
            emit(EventType::InitiativeOrder, "Orden de iniciativa", joinIds(initiative),
                 Faction::Neutral, 0, 0, nodeId, 0, 0, initiative);
        }
    }

    const CombatAction action = combatActions_[combatActionIndex_];
    Operative* attacker = tree_.find(action.attackerId);
    if (!attacker || !attacker->alive() || attacker->recentlyConverted || !attacker->activeWeapon()) {
        ++combatActionIndex_;
        return;
    }
    BTree::NodeId targetNode = 0;
    Operative* target = selectAutomaticTarget(action, *attacker, &targetNode);
    if (!target) {
        ++combatActionIndex_;
        return;
    }

    const Weapon* active = attacker->activeWeapon();
    if (attacker->isHero && active && active->blastType == "TROYANO") {
        awaitingTacticalAction_ = action;
        pending_ = {DecisionType::TrojanTarget, attacker->faction, attacker->id, 0, 0, false,
                    enemyIds(attacker->faction, true), "Elige un enemigo global para Troyano"};
        emit(EventType::DecisionRequested, "Objetivo de Troyano", pending_.prompt,
             attacker->faction, attacker->id, 0, action.originNode);
        return;
    }
    if (attacker->isHero && active && active->blastType == "DISRUPCION") {
        awaitingTacticalAction_ = action;
        pending_ = {DecisionType::Disruption, attacker->faction, attacker->id, 0, 0, false,
                    enemyIds(attacker->faction, true), "Elige enemigo y nuevo ID libre"};
        emit(EventType::DecisionRequested, "Vector de Disrupcion", pending_.prompt,
             attacker->faction, attacker->id, 0, action.originNode);
        return;
    }
    performRegularAttack(*attacker, *target, targetNode);
    ++combatActionIndex_;
}

Operative* GameEngine::selectAutomaticTarget(const CombatAction& action, const Operative& attacker,
                                             BTree::NodeId* targetNode) {
    const auto origin = tree_.node(action.originNode);
    if (!origin) return nullptr;
    auto highestEnemy = [&](const BTree::NodeSnapshot& node) -> Operative* {
        for (auto iterator = node.operatives.rbegin(); iterator != node.operatives.rend(); ++iterator) {
            if (iterator->alive() && iterator->faction != attacker.faction) {
                if (targetNode) *targetNode = node.id;
                return tree_.find(iterator->id);
            }
        }
        return nullptr;
    };
    if (action.nodeWasInConflict) return highestEnemy(*origin);
    for (const auto childId : origin->children) {
        const auto child = tree_.node(childId);
        if (!child) continue;
        if (auto* result = highestEnemy(*child)) return result;
    }
    return nullptr;
}

bool GameEngine::submitTactical(const TacticalCommand& command, std::string* error) {
    auto fail = [&](std::string message) {
        if (error) *error = std::move(message);
        return false;
    };
    if (!awaitingTacticalAction_ ||
        (pending_.type != DecisionType::TrojanTarget && pending_.type != DecisionType::Disruption))
        return fail("No hay una habilidad tactica pendiente.");
    if (std::find(pending_.candidates.begin(), pending_.candidates.end(), command.targetId) ==
        pending_.candidates.end())
        return fail("El objetivo no es un enemigo vivo valido.");
    Operative* attacker = tree_.find(pending_.attackerId);
    if (!attacker || !attacker->alive()) return fail("El atacante ya no esta disponible.");
    if (pending_.type == DecisionType::Disruption) {
        if (command.destinationId < kMinimumId || command.destinationId > kMaximumId)
            return fail("El destino debe estar entre 1 y 999.");
        if (tree_.contains(command.destinationId)) return fail("El ID destino ya esta ocupado.");
        queueDisruption(*attacker, command.targetId, command.destinationId);
    } else {
        performTrojan(*attacker, command.targetId);
    }
    pending_ = {};
    awaitingTacticalAction_.reset();
    ++combatActionIndex_;
    return true;
}

void GameEngine::performTrojan(Operative& attacker, const int targetId) {
    Operative* target = tree_.find(targetId);
    if (!target) return;
    const Shield* shield = target->activeShield();
    if (shield && shield->name == "Cortafuegos Cuántico") {
        emit(EventType::TrojanBlocked, "Troyano bloqueado",
             "El Cortafuegos Cuantico rechazo la conversion.", attacker.faction,
             attacker.id, target->id, tree_.nodeIdFor(target->id).value_or(0));
    } else {
        target->faction = attacker.faction;
        target->recentlyConverted = true;
        ++statistics_.conversions;
        emit(EventType::OperativeConverted, "Control mental exitoso",
             target->name + " ahora combate para " + factionName(attacker.faction) + ".",
             attacker.faction, attacker.id, target->id, tree_.nodeIdFor(target->id).value_or(0));
    }
    spendActiveWeapon(attacker, 50, true);
}

void GameEngine::queueDisruption(Operative& attacker, const int targetId, const int destinationId) {
    const bool alreadyQueued = std::any_of(relocations_.begin(), relocations_.end(),
        [&](const PendingRelocation& relocation) { return relocation.targetId == targetId; });
    if (!alreadyQueued) {
        relocations_.push_back({targetId, destinationId});
        emit(EventType::DisruptionQueued, "Disrupcion programada",
             "El operativo " + std::to_string(targetId) + " sera reubicado al ID " +
                 std::to_string(destinationId) + " durante la limpieza.",
             attacker.faction, attacker.id, targetId, tree_.nodeIdFor(targetId).value_or(0), destinationId);
    } else {
        emit(EventType::Warning, "Disrupcion duplicada descartada",
             "El primer vector sobre ese objetivo conserva prioridad.", attacker.faction,
             attacker.id, targetId);
    }
    spendActiveWeapon(attacker, 50, true);
}

void GameEngine::performRegularAttack(Operative& attacker, Operative& target,
                                      const BTree::NodeId targetNode) {
    Weapon* weapon = attacker.activeWeapon();
    if (!weapon) return;
    const std::string weaponName = weapon->name.empty() ? weapon->blastType : weapon->name;
    emit(EventType::AttackStarted, "Ataque: " + weaponName,
         attacker.name + " ataca a " + target.name + ".", attacker.faction,
         attacker.id, target.id, targetNode);
    ++statistics_.attacks;

    if (weapon->name == "Granada de Pulso Electromagnético") {
        performGrenadeAttack(attacker, targetNode, target.id);
    } else {
        int extraDamage = 0;
        const int realAttack = weapon->damage + attacker.attack;
        if (weapon->name == "Rifle Francotirador Gauss")
            extraDamage = static_cast<int>(realAttack * 0.10);
        else if (weapon->name == "Espada de Iones" && target.activeShield() &&
                 target.activeShield()->name == "Barrera de Energía Cinética")
            extraDamage = static_cast<int>(realAttack * 0.20);
        const bool malware = weapon->name == "Inyector de Malware";
        applyDamage(attacker, *weapon, target, targetNode, extraDamage);
        if (malware) {
            target.speed = std::max(0, target.speed - 20);
            emit(EventType::Information, "Malware inyectado",
                 "La rapidez del objetivo bajo a " + std::to_string(target.speed) + ".",
                 attacker.faction, attacker.id, target.id, targetNode, 20);
        }
    }
    spendActiveWeapon(attacker);
}

void GameEngine::applyDamage(Operative& attacker, Weapon& weapon, Operative& target,
                             const BTree::NodeId targetNode, const int extraDamage,
                             const bool /*deflectorArea*/) {
    const int previousTargetHp = target.baseHp;
    const int baseAttack = weapon.damage + attacker.attack;
    Shield* shield = target.activeShield();
    if (!shield) {
        const int dealt = baseAttack + extraDamage;
        target.baseHp -= dealt;
        emit(EventType::DamageApplied, "Impacto directo",
             std::to_string(dealt) + " puntos alcanzaron el HP.", attacker.faction,
             attacker.id, target.id, targetNode, dealt);
        markFallenIfNeeded(target, previousTargetHp);
        return;
    }

    const std::string shieldName = shield->name;
    const double resistance = std::clamp(shield->durability / 10.0, 0.0, 100.0);
    const int resistanceAbsorbed = static_cast<int>(baseAttack * (resistance / 100.0));
    int impact = baseAttack - resistanceAbsorbed + extraDamage;
    if (shieldName == "Módulo de Camuflaje Óptico") {
        const int evaded = static_cast<int>(impact * 0.30);
        impact -= evaded;
        emit(EventType::AttackEvaded, "Camuflaje optico",
             std::to_string(evaded) + " puntos se perdieron en la distorsion.", target.faction,
             attacker.id, target.id, targetNode, evaded);
    }

    shield->absorption -= impact;
    emit(EventType::DamageAbsorbed, "Resistencia de escudo",
         std::to_string(resistanceAbsorbed) + " puntos fueron anulados por resistencia.",
         target.faction, attacker.id, target.id, targetNode, resistanceAbsorbed);

    if (shieldName == "Blindaje Reactivo" && resistanceAbsorbed > 0) {
        const int previousAttackerHp = attacker.baseHp;
        if (Shield* attackerShield = attacker.activeShield()) {
            attackerShield->absorption -= resistanceAbsorbed;
            if (attackerShield->absorption <= 0) {
                attacker.baseHp += attackerShield->absorption;
                const std::string brokenName = attackerShield->name;
                attacker.popShield();
                ++statistics_.shieldsBroken;
                emit(EventType::ShieldBroken, "Escudo roto por rebote", brokenName,
                     attacker.faction, target.id, attacker.id,
                     tree_.nodeIdFor(attacker.id).value_or(0), resistanceAbsorbed);
            }
        } else {
            attacker.baseHp -= resistanceAbsorbed;
        }
        emit(EventType::ReactiveDamage, "Blindaje reactivo",
             std::to_string(resistanceAbsorbed) + " puntos regresaron al atacante.",
             target.faction, target.id, attacker.id, tree_.nodeIdFor(attacker.id).value_or(0),
             resistanceAbsorbed);
        markFallenIfNeeded(attacker, previousAttackerHp);
    }

    if (shield->absorption <= 0) {
        const int overflow = -shield->absorption;
        target.baseHp -= overflow;
        target.popShield();
        ++statistics_.shieldsBroken;
        emit(EventType::ShieldBroken, "Escudo roto", shieldName,
             target.faction, attacker.id, target.id, targetNode, impact, overflow);
        if (overflow > 0) {
            emit(EventType::DamageApplied, "Dano excedente",
                 std::to_string(overflow) + " puntos atravesaron el escudo.", attacker.faction,
                 attacker.id, target.id, targetNode, overflow);
        }
    } else {
        shield->durability = std::max(0, shield->durability - 50);
        emit(EventType::ShieldDamaged, "Escudo debilitado",
             shieldName + " conserva " + std::to_string(shield->absorption) + " de absorcion.",
             target.faction, attacker.id, target.id, targetNode, impact, shield->absorption);
    }
    markFallenIfNeeded(target, previousTargetHp);
}

void GameEngine::performGrenadeAttack(Operative& attacker, const BTree::NodeId targetNode,
                                      const int primaryTargetId) {
    Weapon* weapon = attacker.activeWeapon();
    const auto node = tree_.node(targetNode);
    if (!weapon || !node) return;
    std::vector<int> enemies;
    int deflectorId = 0;
    for (const auto& candidate : node->operatives) {
        if (!candidate.alive() || candidate.faction == attacker.faction) continue;
        enemies.push_back(candidate.id);
    }
    if (Operative* primary = tree_.find(primaryTargetId);
        primary && primary->alive() && primary->faction != attacker.faction &&
        primary->activeShield() &&
        primary->activeShield()->name == "Proyector de Campo Deflector") {
        deflectorId = primaryTargetId;
    }
    for (const int enemyId : enemies) {
        if (deflectorId != 0) break;
        const Operative* live = tree_.find(enemyId);
        if (deflectorId == 0 && live && live->activeShield() &&
            live->activeShield()->name == "Proyector de Campo Deflector")
            deflectorId = enemyId;
    }
    if (deflectorId == 0) {
        for (const int id : enemies) {
            if (Operative* target = tree_.find(id); target && target->alive())
                applyDamage(attacker, *weapon, *target, targetNode);
        }
        return;
    }

    Operative* deflector = tree_.find(deflectorId);
    if (!deflector || !deflector->activeShield()) return;
    const int baseAttack = weapon->damage + attacker.attack;
    const double resistance = std::clamp(deflector->activeShield()->durability / 10.0, 0.0, 100.0);
    const int areaImpact = baseAttack - static_cast<int>(baseAttack * (resistance / 100.0));
    emit(EventType::DamageAbsorbed, "Campo Deflector enlazado",
         "El campo fijo un impacto de area de " + std::to_string(areaImpact) + ".",
         deflector->faction, attacker.id, deflectorId, targetNode, areaImpact);

    for (const int id : enemies) {
        Operative* target = tree_.find(id);
        if (!target || !target->alive()) continue;
        const int previousHp = target->baseHp;
        if (Shield* shield = target->activeShield()) {
            const std::string name = shield->name;
            shield->absorption -= areaImpact;
            if (shield->absorption <= 0) {
                const int overflow = -shield->absorption;
                target->baseHp -= overflow;
                target->popShield();
                ++statistics_.shieldsBroken;
                emit(EventType::ShieldBroken, "Escudo roto por EMP", name,
                     target->faction, attacker.id, target->id, targetNode, areaImpact, overflow);
            } else {
                shield->durability = std::max(0, shield->durability - 50);
                emit(EventType::ShieldDamaged, "EMP de area", name + " absorbio el pulso.",
                     target->faction, attacker.id, target->id, targetNode, areaImpact, shield->absorption);
            }
        } else {
            target->baseHp -= areaImpact;
            emit(EventType::DamageApplied, "EMP sin escudo",
                 std::to_string(areaImpact) + " puntos alcanzaron el HP.", attacker.faction,
                 attacker.id, target->id, targetNode, areaImpact);
        }
        markFallenIfNeeded(*target, previousHp);
    }
}

void GameEngine::spendActiveWeapon(Operative& attacker, const int amount,
                                   const bool forceExhaust) {
    Weapon* weapon = attacker.activeWeapon();
    if (!weapon) return;
    const std::string name = weapon->name.empty() ? weapon->blastType : weapon->name;
    weapon->ammunition -= amount;
    const int remaining = forceExhaust ? 0 : std::max(0, weapon->ammunition);
    emit(EventType::WeaponSpent, "Arsenal consumido",
         name + " conserva " + std::to_string(remaining) + " de municion.",
         attacker.faction, attacker.id, 0, tree_.nodeIdFor(attacker.id).value_or(0), amount,
         remaining);
    if (forceExhaust || weapon->ammunition <= 0) {
        attacker.popWeapon();
        emit(EventType::WeaponExhausted, "Arma agotada", name + " abandono el frente de la cola.",
             attacker.faction, attacker.id, 0, tree_.nodeIdFor(attacker.id).value_or(0));
    }
}

void GameEngine::markFallenIfNeeded(Operative& operative, const int previousHp) {
    if (previousHp > 0 && operative.baseHp <= 0) {
        emit(EventType::OperativeFallen, "Operativo caido", operative.name + " quedo con HP " +
             std::to_string(operative.baseHp) + ".", operative.faction, operative.id, 0,
             tree_.nodeIdFor(operative.id).value_or(0));
    }
}

void GameEngine::cleanupTurn() {
    setPhase(GamePhase::Cleanup);
    std::vector<std::pair<int, Faction>> fallen;
    for (const auto& operative : tree_.inOrder())
        if (!operative.alive()) fallen.emplace_back(operative.id, operative.faction);
    for (const auto& [id, faction] : fallen) {
        if (faction == Faction::Neon) ++statistics_.neonCasualties;
        else if (faction == Faction::Omega) ++statistics_.omegaCasualties;
        if (!tree_.erase(id)) {
            emit(EventType::Warning, "Limpieza inconsistente",
                 "No se pudo retirar el operativo caido " + std::to_string(id) + ".");
        }
    }
    applyRelocations();
    const auto validation = tree_.validate();
    if (!validation) {
        emit(EventType::Warning, "Invariante B-4 violada",
             validation.errors.empty() ? "Validacion estructural fallida." : validation.errors.front());
    }
    stage_ = Stage::FinishTurn;
}

void GameEngine::applyRelocations() {
    for (const auto relocation : relocations_) {
        Operative* target = tree_.find(relocation.targetId);
        if (!target || !target->alive()) continue;
        if (tree_.contains(relocation.destinationId)) {
            emit(EventType::Warning, "Destino de Disrupcion ocupado",
                 "La reubicacion al ID " + std::to_string(relocation.destinationId) + " fue abortada.",
                 target->faction, relocation.targetId, relocation.destinationId);
            continue;
        }
        Operative moved = *target;
        const int oldId = moved.id;
        if (!tree_.erase(oldId)) continue;
        moved.id = relocation.destinationId;
        if (!tree_.insert(std::move(moved))) continue;
        ++statistics_.disruptions;
        emit(EventType::OperativeRelocated, "Disrupcion completada",
             "ID " + std::to_string(oldId) + " se reconstruyo como " +
                 std::to_string(relocation.destinationId) + ".",
             Faction::Neutral, oldId, relocation.destinationId,
             tree_.nodeIdFor(relocation.destinationId).value_or(0));
    }
    relocations_.clear();
}

void GameEngine::finishTurn() {
    updateRootDominance();
    evaluateVictory();
    if (stage_ == Stage::Finished) return;
    emit(EventType::TurnEnded, "Turno completado",
         "La topologia queda estable tras la limpieza.", activeFaction_, 0, 0, 0, turn_);
    stage_ = Stage::ReadyTurn;
}

void GameEngine::updateRootDominance() {
    if (turn_ <= preCombatTurns_ || tree_.empty()) {
        rootDominanceFaction_ = Faction::Neutral;
        rootDominanceTurns_ = 0;
        return;
    }
    const auto snapshot = tree_.snapshot();
    if (!snapshot.rootId) return;
    const auto* root = snapshot.findNode(*snapshot.rootId);
    Faction faction = Faction::Neutral;
    bool mixed = false;
    if (root) {
        for (const auto& operative : root->operatives) {
            if (!operative.alive()) continue;
            if (faction == Faction::Neutral) faction = operative.faction;
            else if (operative.faction != faction) { mixed = true; break; }
        }
    }
    if (mixed || faction == Faction::Neutral) {
        rootDominanceFaction_ = Faction::Neutral;
        rootDominanceTurns_ = 0;
        return;
    }
    if (rootDominanceFaction_ == faction) ++rootDominanceTurns_;
    else {
        rootDominanceFaction_ = faction;
        rootDominanceTurns_ = 1;
    }
    emit(EventType::RootDominance, "Dominio de la raiz",
         factionName(faction) + " sostiene la raiz " + std::to_string(rootDominanceTurns_) + "/3.",
         faction, 0, 0, *snapshot.rootId, rootDominanceTurns_);
}

void GameEngine::evaluateVictory() {
    if (turn_ < 2) return;
    if (tree_.empty()) {
        declareVictory(Faction::Neutral, VictoryReason::MutualAnnihilation,
                       "El Arbol B-4 quedo vacio.");
        return;
    }
    if (rootDominanceTurns_ >= 3) {
        declareVictory(rootDominanceFaction_, VictoryReason::RootDominance,
                       "Dominio sostenido de la raiz durante tres turnos de combate.");
        return;
    }

    int neon = 0;
    int omega = 0;
    for (const auto& operative : tree_.inOrder()) {
        if (!operative.alive()) continue;
        if (operative.faction == Faction::Neon) ++neon;
        else if (operative.faction == Faction::Omega) ++omega;
    }
    auto countWinner = [&]() {
        if (neon > omega) return Faction::Neon;
        if (omega > neon) return Faction::Omega;
        const auto snapshot = tree_.snapshot();
        if (snapshot.rootId) {
            if (const auto* root = snapshot.findNode(*snapshot.rootId); root && !root->operatives.empty())
                return root->operatives.back().faction;
        }
        return Faction::Neutral;
    };

    if (turn_ >= config_.maxTurns) {
        declareVictory(countWinner(), VictoryReason::TurnLimit,
                       "Conteo final NEON " + std::to_string(neon) + " | OMEGA " + std::to_string(omega) + ".");
        return;
    }
    if (neon == 0 || omega == 0) {
        declareVictory(neon > 0 ? Faction::Neon : Faction::Omega, VictoryReason::Annihilation,
                       "Solo una faccion conserva operativos.");
        return;
    }
    if (totalInsertions_ >= kInsertionLimit) {
        declareVictory(countWinner(), VictoryReason::InsertionLimit,
                       "Se alcanzo el limite global de 60 inserciones.");
    }
}

void GameEngine::declareVictory(const Faction winner, const VictoryReason reason, std::string detail) {
    int neon = 0;
    int omega = 0;
    for (const auto& operative : tree_.inOrder()) {
        if (!operative.alive()) continue;
        if (operative.faction == Faction::Neon) ++neon;
        else if (operative.faction == Faction::Omega) ++omega;
    }
    victory_ = {winner, reason, neon, omega, turn_, totalInsertions_, config_.seed, statistics_};
    phase_ = GamePhase::Victory;
    stage_ = Stage::Finished;
    pending_ = {};
    emit(EventType::VictoryDeclared,
         winner == Faction::Neutral ? "Empate" : "Victoria de " + factionName(winner),
         victoryReasonText(reason) + " " + detail, winner, 0, 0, 0, neon, omega);
}

void GameEngine::rearmUnarmedOperatives() {
    if (catalogs_.weapons().empty()) return;
    const auto copies = tree_.inOrder();
    for (const auto& copy : copies) {
        Operative* operative = tree_.find(copy.id);
        if (!operative || !operative->alive() || operative->activeWeapon()) continue;
        operative->enqueueWeapon(weaponFromCatalog(operative->id));
        emit(EventType::WeaponRearmed, "Reabastecimiento orbital",
             operative->name + " recibio un arma por hash de ID.", operative->faction,
             operative->id, 0, tree_.nodeIdFor(operative->id).value_or(0));
    }
}

void GameEngine::clearConversionFlags() {
    const auto copies = tree_.inOrder();
    for (const auto& copy : copies)
        if (auto* operative = tree_.find(copy.id)) operative->recentlyConverted = false;
}

bool GameEngine::editOperative(const EditCommand& command, std::string* error) {
    auto fail = [&](std::string message) {
        if (error) *error = std::move(message);
        return false;
    };
    if (!canUseWorkshop()) return fail("El taller solo esta disponible en el preturno manual.");
    Operative* operative = tree_.find(command.operativeId);
    if (!operative) return fail("Operativo inexistente.");
    const std::string oldName = operative->name;
    int eventOperativeId = command.operativeId;
    const auto bounded = [](const int value) {
        return value >= -kMaximumEditableStat && value <= kMaximumEditableStat;
    };
    const auto validText = [](const std::string& text) {
        return !text.empty() && text.size() <= 64;
    };
    const auto weaponAt = [&](const int index) -> Weapon* {
        if (index < 0 || index >= static_cast<int>(operative->weapons.size())) return nullptr;
        return &operative->weapons[static_cast<std::size_t>(index)];
    };
    const auto shieldAt = [&](const int index) -> Shield* {
        if (index < 0 || index >= static_cast<int>(operative->shields.size())) return nullptr;
        return &operative->shields[static_cast<std::size_t>(index)];
    };
    switch (command.kind) {
    case EditKind::SetHealth:
        if (!bounded(command.value)) return fail("HP fuera de rango.");
        operative->health = command.value;
        operative->baseHp = command.value;
        break;
    case EditKind::SetAttack:
        if (!bounded(command.value)) return fail("Ataque fuera de rango.");
        operative->attack = command.value;
        break;
    case EditKind::SetSpeed:
        if (!bounded(command.value)) return fail("Rapidez fuera de rango.");
        operative->speed = command.value;
        break;
    case EditKind::SetName:
        if (!validText(command.text)) return fail("El nombre debe contener de 1 a 64 bytes UTF-8.");
        operative->name = command.text;
        break;
    case EditKind::ToggleFaction:
        operative->faction = opposingFaction(operative->faction);
        break;
    case EditKind::ToggleHero:
        if (operative->isHero) {
            while (operative->activeWeapon() &&
                   (operative->activeWeapon()->blastType == "TROYANO" ||
                    operative->activeWeapon()->blastType == "DISRUPCION")) {
                operative->popWeapon();
            }
            operative->isHero = false;
        } else {
            operative->isHero = true;
            operative->enqueueWeapon(makeHeroAbility("TROYANO", *operative));
            operative->enqueueWeapon(makeHeroAbility("DISRUPCION", *operative));
        }
        break;
    case EditKind::ChangeId: {
        if (command.value < kMinimumId || command.value > kMaximumId) return fail("ID fuera de rango.");
        if (tree_.contains(command.value)) return fail("ID ya ocupado.");
        Operative moved = *operative;
        if (!tree_.erase(command.operativeId)) return fail("No se pudo retirar el ID anterior.");
        moved.id = command.value;
        if (!tree_.insert(std::move(moved))) return fail("No se pudo insertar el ID nuevo.");
        eventOperativeId = command.value;
        break;
    }
    case EditKind::ApplyTemplate: {
        if (command.templateKind == TemplateKind::Hero)
            return fail("El taller solo copia moldes de especie o personaje.");
        const auto& pool = command.templateKind == TemplateKind::Species
                               ? catalogs_.species() : catalogs_.characters();
        if (command.catalogIndex < 0 || command.catalogIndex >= static_cast<int>(pool.size()))
            return fail("Molde de catalogo fuera de rango.");
        const UnitTemplate& source = pool[static_cast<std::size_t>(command.catalogIndex)];
        operative->name = source.name;
        operative->strength = source.fortitude;
        operative->damage = source.damage;
        operative->health = source.health;
        operative->baseHp = source.health;
        operative->speed = source.speed;
        operative->attack = source.fortitude > 0 ? source.fortitude : source.damage;
        break;
    }
    case EditKind::AddWeapon: {
        if (command.catalogIndex < 0 || command.catalogIndex >= static_cast<int>(catalogs_.weapons().size()))
            return fail("Arma fuera de rango.");
        Weapon weapon = weaponFromCatalog(command.catalogIndex);
        if (std::any_of(operative->weapons.begin(), operative->weapons.end(),
                        [&](const Weapon& current) { return current.id == weapon.id; }))
            return fail("Ese ID de arma ya existe en la cola.");
        operative->enqueueWeapon(std::move(weapon));
        break;
    }
    case EditKind::AddShield: {
        if (command.catalogIndex < 0 || command.catalogIndex >= static_cast<int>(catalogs_.shields().size()))
            return fail("Escudo fuera de rango.");
        Shield shield = shieldFromCatalog(command.catalogIndex);
        if (std::any_of(operative->shields.begin(), operative->shields.end(),
                        [&](const Shield& current) { return current.id == shield.id; }))
            return fail("Ese ID de escudo ya existe en la pila.");
        operative->pushShield(std::move(shield));
        break;
    }
    case EditKind::RemoveActiveWeapon:
        if (!operative->activeWeapon()) return fail("La cola de arsenal ya esta vacia.");
        operative->popWeapon();
        break;
    case EditKind::RemoveActiveShield:
        if (!operative->activeShield()) return fail("La pila de escudos ya esta vacia.");
        operative->popShield();
        break;
    case EditKind::SetWeaponDamage:
    case EditKind::SetWeaponUseCost:
    case EditKind::SetWeaponId:
    case EditKind::SetWeaponAmmo:
    case EditKind::SetWeaponName:
    case EditKind::DeleteWeapon: {
        Weapon* weapon = weaponAt(command.itemIndex);
        if (!weapon) return fail("Arma interna fuera de rango.");
        if (command.kind == EditKind::SetWeaponDamage) {
            if (!bounded(command.value)) return fail("Dano de arma fuera de rango.");
            weapon->damage = command.value;
        } else if (command.kind == EditKind::SetWeaponUseCost) {
            if (!bounded(command.value)) return fail("Costo de arma fuera de rango.");
            weapon->useCost = command.value;
        } else if (command.kind == EditKind::SetWeaponAmmo) {
            if (!bounded(command.value)) return fail("Municion fuera de rango.");
            weapon->ammunition = command.value;
        } else if (command.kind == EditKind::SetWeaponName) {
            if (!validText(command.text)) return fail("Nombre de arma invalido.");
            weapon->name = command.text;
        } else if (command.kind == EditKind::SetWeaponId) {
            if (!bounded(command.value)) return fail("ID de arma fuera de rango.");
            const bool duplicate = std::any_of(
                operative->weapons.begin(), operative->weapons.end(),
                [&](const Weapon& current) { return &current != weapon && current.id == command.value; });
            if (duplicate) return fail("Ese ID de arma ya existe en la cola.");
            weapon->id = command.value;
        } else {
            operative->weapons.erase(operative->weapons.begin() + command.itemIndex);
        }
        break;
    }
    case EditKind::SetShieldAbsorption:
    case EditKind::SetShieldDurability:
    case EditKind::SetShieldId:
    case EditKind::SetShieldName:
    case EditKind::SetShieldWeight:
    case EditKind::DeleteShield: {
        Shield* shield = shieldAt(command.itemIndex);
        if (!shield) return fail("Escudo interno fuera de rango.");
        if (command.kind == EditKind::SetShieldAbsorption) {
            if (!bounded(command.value)) return fail("Absorcion fuera de rango.");
            shield->absorption = command.value;
        } else if (command.kind == EditKind::SetShieldDurability) {
            if (!bounded(command.value)) return fail("Durabilidad fuera de rango.");
            shield->durability = command.value;
        } else if (command.kind == EditKind::SetShieldWeight) {
            if (!bounded(command.value)) return fail("Peso fuera de rango.");
            shield->weight = command.value;
        } else if (command.kind == EditKind::SetShieldName) {
            if (!validText(command.text)) return fail("Nombre de escudo invalido.");
            shield->name = command.text;
        } else if (command.kind == EditKind::SetShieldId) {
            if (!bounded(command.value)) return fail("ID de escudo fuera de rango.");
            const bool duplicate = std::any_of(
                operative->shields.begin(), operative->shields.end(),
                [&](const Shield& current) { return &current != shield && current.id == command.value; });
            if (duplicate) return fail("Ese ID de escudo ya existe en la pila.");
            shield->id = command.value;
        } else {
            operative->shields.erase(operative->shields.begin() + command.itemIndex);
        }
        break;
    }
    case EditKind::DeleteOperative:
        if (!tree_.erase(command.operativeId)) return fail("No se pudo eliminar el operativo.");
        break;
    }
    emit(EventType::OperativeEdited, "Taller aplicado", oldName + " fue modificado desde la UI.",
         activeFaction_, eventOperativeId, command.value);
    return true;
}

const PendingDecision& GameEngine::pendingDecision() const noexcept { return pending_; }
bool GameEngine::hasPendingDecision() const noexcept { return static_cast<bool>(pending_); }
bool GameEngine::awaitingWorkshop() const noexcept {
    return config_.mode == GameMode::Manual && stage_ == Stage::Workshop &&
           phase_ == GamePhase::Workshop && !gameOver();
}
bool GameEngine::canUseWorkshop() const noexcept {
    return awaitingWorkshop() && turn_ > 0;
}
bool GameEngine::gameOver() const noexcept { return stage_ == Stage::Finished; }
bool GameEngine::hasQueuedEvents() const noexcept { return !eventQueue_.empty(); }
std::size_t GameEngine::queuedEventCount() const noexcept { return eventQueue_.size(); }

GameEvent GameEngine::popEvent() {
    if (eventQueue_.empty()) return {};
    GameEvent event = std::move(eventQueue_.front());
    eventQueue_.pop_front();
    return event;
}

void GameEngine::discardQueuedEvents() noexcept { eventQueue_.clear(); }
const std::vector<GameEvent>& GameEngine::history() const noexcept { return history_; }

std::uint64_t GameEngine::historyDigest() const noexcept {
    std::uint64_t hash = 1469598103934665603ULL;
    const auto add = [&](const auto& value) {
        const auto* bytes = reinterpret_cast<const unsigned char*>(&value);
        for (std::size_t index = 0; index < sizeof(value); ++index) {
            hash ^= bytes[index];
            hash *= 1099511628211ULL;
        }
    };
    const auto addText = [&](const std::string& text) {
        for (const unsigned char character : text) {
            hash ^= character;
            hash *= 1099511628211ULL;
        }
    };
    for (const auto& event : history_) {
        const int type = static_cast<int>(event.type);
        const int faction = static_cast<int>(event.faction);
        add(type); add(event.turn); add(faction); add(event.sourceId); add(event.targetId);
        add(event.nodeId); add(event.amount); add(event.secondaryAmount);
        addText(event.title); addText(event.detail);
    }
    return hash;
}

const Catalog& GameEngine::catalogs() const noexcept { return catalogs_; }
Catalog& GameEngine::catalogs() noexcept { return catalogs_; }
const BTree& GameEngine::tree() const noexcept { return tree_; }
BTree& GameEngine::tree() noexcept { return tree_; }
const VictorySummary& GameEngine::victory() const noexcept { return victory_; }

GameSnapshot GameEngine::snapshot() const {
    return {config_.mode, phase_, turn_, config_.maxTurns, preCombatTurns_, activeFaction_,
            insertionRoll_, remainingInsertions_, totalInsertions_, rootDominanceTurns_,
            rootDominanceFaction_, config_.seed, gameOver(), tree_.snapshot(), statistics_, victory_};
}

std::vector<int> GameEngine::enemyIds(const Faction faction, const bool aliveOnly) const {
    std::vector<int> result;
    for (const auto& operative : tree_.inOrder())
        if (operative.faction != faction && operative.faction != Faction::Neutral &&
            (!aliveOnly || operative.alive())) result.push_back(operative.id);
    return result;
}

std::vector<int> GameEngine::freeIds() const {
    std::vector<int> result;
    result.reserve(kMaximumId - tree_.size());
    for (int id = kMinimumId; id <= kMaximumId; ++id)
        if (!tree_.contains(id)) result.push_back(id);
    return result;
}

int GameEngine::randomInt(const int minimum, const int maximum) {
    std::uniform_int_distribution<int> distribution(minimum, maximum);
    return distribution(rng_);
}

std::vector<const UnitTemplate*> GameEngine::allowedTemplates(const TemplateKind kind) const {
    std::vector<const UnitTemplate*> result;
    const std::vector<UnitTemplate>* pool = nullptr;
    if (kind == TemplateKind::Species) pool = &catalogs_.species();
    else if (kind == TemplateKind::Character) pool = &catalogs_.characters();
    else pool = &catalogs_.heroes();
    for (const auto& unit : *pool) result.push_back(&unit);
    return result;
}

void GameEngine::emit(const EventType type, std::string title, std::string detail,
                      const Faction faction, const int sourceId, const int targetId,
                      const BTree::NodeId nodeId, const int amount, const int secondaryAmount,
                      std::vector<int> ids) {
    GameEvent event{nextEventSequence_++, type, phase_, turn_, faction, sourceId, targetId,
                    nodeId, amount, secondaryAmount, std::move(ids), std::move(title), std::move(detail)};
    history_.push_back(event);
    eventQueue_.push_back(std::move(event));
}

void GameEngine::setPhase(const GamePhase phase, std::string detail) {
    phase_ = phase;
    emit(EventType::PhaseChanged, "Fase: " + std::string(phaseName(phase)), std::move(detail));
}

bool GameEngine::isHeroTurn(const int turn) const noexcept {
    static constexpr int heroTurns[] = {3, 4, 6, 7, 9, 10, 12, 13, 15, 16};
    return std::find(std::begin(heroTurns), std::end(heroTurns), turn) != std::end(heroTurns);
}

Faction GameEngine::opposingFaction(const Faction faction) noexcept {
    return yggdrasil::opposingFaction(faction);
}

std::string GameEngine::factionName(const Faction faction) {
    return std::string(yggdrasil::factionName(faction));
}

std::string GameEngine::victoryReasonText(const VictoryReason reason) {
    return std::string(victoryReasonName(reason));
}

std::string_view gameModeName(const GameMode mode) noexcept {
    return mode == GameMode::Manual ? "Manual local" : "IA vs IA";
}

std::string_view decisionTypeName(const DecisionType type) noexcept {
    switch (type) {
    case DecisionType::None: return "ninguna";
    case DecisionType::Recruit: return "reclutamiento";
    case DecisionType::TrojanTarget: return "objetivo_troyano";
    case DecisionType::Disruption: return "disrupcion";
    }
    return "ninguna";
}

std::string_view victoryReasonName(const VictoryReason reason) noexcept {
    switch (reason) {
    case VictoryReason::None: return "Sin resultado.";
    case VictoryReason::Annihilation: return "Aniquilacion.";
    case VictoryReason::MutualAnnihilation: return "Aniquilacion mutua.";
    case VictoryReason::RootDominance: return "Dominio sostenido de la raiz.";
    case VictoryReason::TurnLimit: return "Limite de turnos y conteo final.";
    case VictoryReason::InsertionLimit: return "Limite de inserciones y conteo final.";
    }
    return "Sin resultado.";
}

} // namespace yggdrasil
