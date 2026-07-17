#include "yggdrasil/core/event.hpp"

namespace yggdrasil {

std::string_view phaseName(const GamePhase phase) noexcept {
    switch (phase) {
    case GamePhase::Menu: return "Menu";
    case GamePhase::Setup: return "Configuracion";
    case GamePhase::TurnStart: return "Inicio de turno";
    case GamePhase::Workshop: return "Taller";
    case GamePhase::Recruitment: return "Reclutamiento";
    case GamePhase::PreCombat: return "Pre-combate";
    case GamePhase::Combat: return "Combate";
    case GamePhase::Cleanup: return "Limpieza";
    case GamePhase::Victory: return "Victoria";
    }
    return "Desconocida";
}

std::string_view eventTypeName(const EventType type) noexcept {
    switch (type) {
    case EventType::SessionStarted: return "partida_iniciada";
    case EventType::CoinFlipped: return "moneda_lanzada";
    case EventType::TurnStarted: return "turno_iniciado";
    case EventType::PhaseChanged: return "fase_cambiada";
    case EventType::DieRolled: return "dado_lanzado";
    case EventType::DecisionRequested: return "decision_solicitada";
    case EventType::OperativeCreated: return "operativo_creado";
    case EventType::OperativeInserted: return "operativo_insertado";
    case EventType::NodeSplit: return "nodo_dividido";
    case EventType::CombatStarted: return "combate_iniciado";
    case EventType::InitiativeOrder: return "orden_iniciativa";
    case EventType::AttackStarted: return "ataque_realizado";
    case EventType::DamageApplied: return "danio_aplicado";
    case EventType::DamageAbsorbed: return "danio_absorbido";
    case EventType::ShieldDamaged: return "escudo_danado";
    case EventType::ShieldBroken: return "escudo_roto";
    case EventType::ReactiveDamage: return "danio_reactivo";
    case EventType::AttackEvaded: return "ataque_evadido";
    case EventType::WeaponSpent: return "arma_usada";
    case EventType::WeaponExhausted: return "arma_agotada";
    case EventType::TrojanBlocked: return "troyano_bloqueado";
    case EventType::OperativeConverted: return "operativo_convertido";
    case EventType::DisruptionQueued: return "disrupcion_programada";
    case EventType::OperativeRelocated: return "operativo_reubicado";
    case EventType::OperativeFallen: return "operativo_caido";
    case EventType::OperativeRemoved: return "operativo_eliminado";
    case EventType::NodeBorrowed: return "prestamo_estructural";
    case EventType::NodesMerged: return "nodos_fusionados";
    case EventType::RootReduced: return "raiz_reducida";
    case EventType::WeaponRearmed: return "arma_reabastecida";
    case EventType::OperativeEdited: return "operativo_modificado";
    case EventType::RootDominance: return "dominio_raiz";
    case EventType::TurnEnded: return "turno_finalizado";
    case EventType::VictoryDeclared: return "victoria";
    case EventType::Information: return "informacion";
    case EventType::Warning: return "advertencia";
    }
    return "desconocido";
}

} // namespace yggdrasil
