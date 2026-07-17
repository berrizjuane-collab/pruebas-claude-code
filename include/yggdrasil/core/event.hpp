#pragma once

#include "yggdrasil/core/types.hpp"

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace yggdrasil {

enum class GamePhase {
    Menu,
    Setup,
    TurnStart,
    Workshop,
    Recruitment,
    PreCombat,
    Combat,
    Cleanup,
    Victory,
};

enum class EventType {
    SessionStarted,
    CoinFlipped,
    TurnStarted,
    PhaseChanged,
    DieRolled,
    DecisionRequested,
    OperativeCreated,
    OperativeInserted,
    NodeSplit,
    CombatStarted,
    InitiativeOrder,
    AttackStarted,
    DamageApplied,
    DamageAbsorbed,
    ShieldDamaged,
    ShieldBroken,
    ReactiveDamage,
    AttackEvaded,
    WeaponSpent,
    WeaponExhausted,
    TrojanBlocked,
    OperativeConverted,
    DisruptionQueued,
    OperativeRelocated,
    OperativeFallen,
    OperativeRemoved,
    NodeBorrowed,
    NodesMerged,
    RootReduced,
    WeaponRearmed,
    OperativeEdited,
    RootDominance,
    TurnEnded,
    VictoryDeclared,
    Information,
    Warning,
};

struct GameEvent {
    std::uint64_t sequence{0};
    EventType type{EventType::Information};
    GamePhase phase{GamePhase::Menu};
    int turn{0};
    Faction faction{Faction::Neutral};
    int sourceId{0};
    int targetId{0};
    std::uint64_t nodeId{0};
    int amount{0};
    int secondaryAmount{0};
    std::vector<int> ids;
    std::string title;
    std::string detail;
};

[[nodiscard]] std::string_view phaseName(GamePhase phase) noexcept;
[[nodiscard]] std::string_view eventTypeName(EventType type) noexcept;

} // namespace yggdrasil
