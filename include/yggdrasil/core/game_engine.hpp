#pragma once

#include "yggdrasil/core/btree.hpp"
#include "yggdrasil/core/catalog.hpp"
#include "yggdrasil/core/event.hpp"

#include <cstdint>
#include <deque>
#include <filesystem>
#include <optional>
#include <random>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace yggdrasil {

enum class GameMode { Manual, AiVsAi };
enum class RecruitmentMode { Catalog, QuickClass, Custom };
enum class TemplateKind { Species, Character, Hero };
enum class DecisionType { None, Recruit, TrojanTarget, Disruption };
enum class VictoryReason {
    None,
    Annihilation,
    MutualAnnihilation,
    RootDominance,
    TurnLimit,
    InsertionLimit,
};

struct GameConfig {
    GameMode mode{GameMode::Manual};
    int maxTurns{10};
    std::uint64_t seed{0x5947474452415349ULL};
    float visualSpeed{1.0F};
    bool reducedEffects{false};
};

struct RecruitCommand {
    RecruitmentMode mode{RecruitmentMode::Catalog};
    int id{0};
    TemplateKind templateKind{TemplateKind::Species};
    int templateIndex{0};
    int classType{3};
    std::string customName{"Operativo"};
    int health{100};
    int attack{50};
    int speed{70};
    int weaponIndex{0};
    int shieldIndex{0};
};

struct TacticalCommand {
    int targetId{0};
    int destinationId{0};
};

struct PendingDecision {
    DecisionType type{DecisionType::None};
    Faction faction{Faction::Neutral};
    int attackerId{0};
    int remainingInsertions{0};
    int recruitmentTier{1};
    bool heroOnly{false};
    std::vector<int> candidates;
    std::string prompt;

    [[nodiscard]] explicit operator bool() const noexcept { return type != DecisionType::None; }
};

enum class EditKind {
    SetHealth,
    SetAttack,
    SetSpeed,
    SetName,
    ToggleFaction,
    ToggleHero,
    ChangeId,
    ApplyTemplate,
    AddWeapon,
    AddShield,
    RemoveActiveWeapon,
    RemoveActiveShield,
    SetWeaponDamage,
    SetWeaponUseCost,
    SetWeaponId,
    SetWeaponAmmo,
    SetWeaponName,
    DeleteWeapon,
    SetShieldAbsorption,
    SetShieldDurability,
    SetShieldId,
    SetShieldName,
    SetShieldWeight,
    DeleteShield,
    DeleteOperative,
};

struct EditCommand {
    EditKind kind{EditKind::SetHealth};
    int operativeId{0};
    int value{0};
    int catalogIndex{0};
    int itemIndex{0};
    std::string text;
    TemplateKind templateKind{TemplateKind::Species};
};

struct BattleStatistics {
    int neonCasualties{0};
    int omegaCasualties{0};
    int conversions{0};
    int disruptions{0};
    int attacks{0};
    int shieldsBroken{0};
};

struct VictorySummary {
    Faction winner{Faction::Neutral};
    VictoryReason reason{VictoryReason::None};
    int neonSurvivors{0};
    int omegaSurvivors{0};
    int turnsPlayed{0};
    int totalInsertions{0};
    std::uint64_t seed{0};
    BattleStatistics statistics;
};

struct GameSnapshot {
    GameMode mode{GameMode::Manual};
    GamePhase phase{GamePhase::Menu};
    int turn{0};
    int maxTurns{0};
    int preCombatTurns{0};
    Faction activeFaction{Faction::Neutral};
    int insertionRoll{0};
    int remainingInsertions{0};
    int totalInsertions{0};
    int rootDominanceTurns{0};
    Faction rootDominanceFaction{Faction::Neutral};
    std::uint64_t seed{0};
    bool gameOver{false};
    BTree::TreeSnapshot tree;
    BattleStatistics statistics;
    VictorySummary victory;
};

class GameEngine {
public:
    GameEngine();

    [[nodiscard]] bool loadCatalogs(const std::filesystem::path& explicitDataDirectory = {},
                                    const std::filesystem::path& executablePath = {});
    [[nodiscard]] const std::vector<std::string>& catalogDiagnostics() const noexcept;
    [[nodiscard]] bool catalogsReady() const noexcept;

    void start(GameConfig config);
    void pump();

    [[nodiscard]] bool submitRecruit(const RecruitCommand& command, std::string* error = nullptr);
    [[nodiscard]] bool submitTactical(const TacticalCommand& command, std::string* error = nullptr);
    [[nodiscard]] bool editOperative(const EditCommand& command, std::string* error = nullptr);
    [[nodiscard]] bool continueWorkshop(std::string* error = nullptr);
    [[nodiscard]] bool validateRecruit(const RecruitCommand& command, std::string* error = nullptr) const;

    [[nodiscard]] const PendingDecision& pendingDecision() const noexcept;
    [[nodiscard]] bool hasPendingDecision() const noexcept;
    [[nodiscard]] bool awaitingWorkshop() const noexcept;
    [[nodiscard]] bool canUseWorkshop() const noexcept;
    [[nodiscard]] bool gameOver() const noexcept;

    [[nodiscard]] bool hasQueuedEvents() const noexcept;
    [[nodiscard]] std::size_t queuedEventCount() const noexcept;
    GameEvent popEvent();
    void discardQueuedEvents() noexcept;
    [[nodiscard]] const std::vector<GameEvent>& history() const noexcept;
    [[nodiscard]] std::uint64_t historyDigest() const noexcept;

    [[nodiscard]] const Catalog& catalogs() const noexcept;
    [[nodiscard]] Catalog& catalogs() noexcept;
    [[nodiscard]] const BTree& tree() const noexcept;
    [[nodiscard]] BTree& tree() noexcept;
    [[nodiscard]] GameSnapshot snapshot() const;
    [[nodiscard]] const VictorySummary& victory() const noexcept;

    [[nodiscard]] std::vector<int> enemyIds(Faction faction, bool aliveOnly = true) const;
    [[nodiscard]] std::vector<int> freeIds() const;
    [[nodiscard]] int randomInt(int minimum, int maximum);

private:
    enum class Stage {
        Idle,
        ReadyTurn,
        Workshop,
        Recruiting,
        CombatSetup,
        CombatActions,
        Cleanup,
        FinishTurn,
        Finished,
    };

    struct CombatAction {
        int attackerId{0};
        BTree::NodeId originNode{0};
        bool nodeWasInConflict{false};
    };

    struct PendingRelocation {
        int targetId{0};
        int destinationId{0};
    };

    void resetState();
    void beginTurn();
    void beginRecruitment();
    void requestRecruitment();
    void setupCombat();
    void processNextCombatAction();
    void performRegularAttack(Operative& attacker, Operative& target, BTree::NodeId targetNode);
    void performTrojan(Operative& attacker, int targetId);
    void queueDisruption(Operative& attacker, int targetId, int destinationId);
    void applyDamage(Operative& attacker, Weapon& weapon, Operative& target,
                     BTree::NodeId targetNode, int extraDamage = 0, bool deflectorArea = false);
    void performGrenadeAttack(Operative& attacker, BTree::NodeId targetNode, int primaryTargetId);
    void spendActiveWeapon(Operative& attacker, int amount = 50,
                           bool forceExhaust = false);
    void markFallenIfNeeded(Operative& operative, int previousHp);
    void cleanupTurn();
    void applyRelocations();
    void finishTurn();
    void evaluateVictory();
    void declareVictory(Faction winner, VictoryReason reason, std::string detail);
    void updateRootDominance();
    void rearmUnarmedOperatives();
    void clearConversionFlags();
    void buildCombatActions();
    [[nodiscard]] Operative* selectAutomaticTarget(const CombatAction& action, const Operative& attacker,
                                                   BTree::NodeId* targetNode = nullptr);
    [[nodiscard]] bool nodeInConflict(const BTree::NodeSnapshot& node) const;
    [[nodiscard]] bool isHeroTurn(int turn) const noexcept;
    [[nodiscard]] Operative createOperative(const RecruitCommand& command);
    [[nodiscard]] Weapon weaponFromCatalog(int index) const;
    [[nodiscard]] Shield shieldFromCatalog(int index) const;
    [[nodiscard]] Weapon makeHeroAbility(std::string name, const Operative& owner);
    [[nodiscard]] Weapon makeSimpleBlast();
    [[nodiscard]] Shield makeClassShield(int classType);
    [[nodiscard]] std::vector<const UnitTemplate*> allowedTemplates(TemplateKind kind) const;
    void emit(EventType type, std::string title, std::string detail = {}, Faction faction = Faction::Neutral,
              int sourceId = 0, int targetId = 0, BTree::NodeId nodeId = 0,
              int amount = 0, int secondaryAmount = 0, std::vector<int> ids = {});
    void setPhase(GamePhase phase, std::string detail = {});
    [[nodiscard]] static Faction opposingFaction(Faction faction) noexcept;
    [[nodiscard]] static std::string factionName(Faction faction);
    [[nodiscard]] static std::string victoryReasonText(VictoryReason reason);

    Catalog catalogs_;
    BTree tree_;
    GameConfig config_;
    Stage stage_{Stage::Idle};
    GamePhase phase_{GamePhase::Menu};
    std::mt19937_64 rng_;
    std::uint64_t nextEventSequence_{1};
    std::deque<GameEvent> eventQueue_;
    std::vector<GameEvent> history_;
    PendingDecision pending_;
    VictorySummary victory_;
    BattleStatistics statistics_;
    int turn_{0};
    int preCombatTurns_{4};
    Faction startingFaction_{Faction::Neutral};
    Faction activeFaction_{Faction::Neutral};
    Faction rootDominanceFaction_{Faction::Neutral};
    int rootDominanceTurns_{0};
    int insertionRoll_{0};
    int remainingInsertions_{0};
    int totalInsertions_{0};
    int recruitmentTier_{1};
    bool heroTurn_{false};
    std::vector<CombatAction> combatActions_;
    std::size_t combatActionIndex_{0};
    std::vector<BTree::NodeId> combatNodeOrder_;
    std::size_t combatNodeIndex_{0};
    std::optional<CombatAction> awaitingTacticalAction_;
    std::vector<PendingRelocation> relocations_;
};

[[nodiscard]] std::string_view gameModeName(GameMode mode) noexcept;
[[nodiscard]] std::string_view decisionTypeName(DecisionType type) noexcept;
[[nodiscard]] std::string_view victoryReasonName(VictoryReason reason) noexcept;

} // namespace yggdrasil
