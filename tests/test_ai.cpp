#include "yggdrasil/ai/ai_controller.hpp"

#include <algorithm>
#include <array>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {

using yggdrasil::AIController;
using yggdrasil::EditCommand;
using yggdrasil::EditKind;
using yggdrasil::EventType;
using yggdrasil::Faction;
using yggdrasil::GameConfig;
using yggdrasil::GameEngine;
using yggdrasil::GameMode;
using yggdrasil::Operative;

void require(const bool condition, const std::string& message) {
    if (!condition) {
        throw std::runtime_error(message);
    }
}

std::filesystem::path findDataDirectory() {
    const std::filesystem::path sourceRelative =
        std::filesystem::path(__FILE__).parent_path().parent_path() / "data";
    const std::filesystem::path working = std::filesystem::current_path();
    const std::array candidates{
        sourceRelative,
        working / "data",
        working.parent_path() / "data",
        working.parent_path().parent_path() / "data",
    };

    for (const std::filesystem::path& candidate : candidates) {
        std::error_code error;
        if (std::filesystem::is_regular_file(candidate / "armas.txt", error)
            && std::filesystem::is_regular_file(candidate / "heroes.txt", error)) {
            return candidate;
        }
    }
    throw std::runtime_error("No se encontro el directorio data para test_ai.");
}

struct ReplayResult {
    std::uint64_t digest{0};
    yggdrasil::VictorySummary victory;
    yggdrasil::BTree::TreeSnapshot tree;
    bool trojanResolved{false};
    bool disruptionResolved{false};
};

ReplayResult play(const std::filesystem::path& dataDirectory,
                  const std::uint64_t seed,
                  const int maxTurns = 8,
                  const GameMode mode = GameMode::AiVsAi) {
    GameEngine engine;
    require(engine.loadCatalogs(dataDirectory), "No se pudieron cargar los catalogos.");

    GameConfig config;
    config.mode = mode;
    config.maxTurns = maxTurns;
    config.seed = seed;
    engine.start(config);

    AIController ai;
    std::string error;
    require(ai.runHeadless(engine, 100'000, &error),
            "La partida automatica fallo: " + error);
    require(engine.gameOver(), "La partida automatica no termino.");
    require(!engine.hasPendingDecision(), "Quedo una decision de IA sin resolver.");
    require(!ai.lastExplanation().empty(), "La IA no explico su ultima decision.");

    const auto validation = engine.tree().validate();
    require(validation.valid, "La IA dejo invalido el arbol B-4.");
    for (const auto& operative : engine.tree().inOrder()) {
        require(operative.id >= 1 && operative.id <= 999,
                "La IA genero un ID fuera del rango legal.");
    }

    bool victoryEvent = false;
    bool trojanResolved = false;
    bool disruptionResolved = false;
    for (const auto& event : engine.history()) {
        victoryEvent = victoryEvent || event.type == EventType::VictoryDeclared;
        trojanResolved = trojanResolved || event.type == EventType::TrojanBlocked
                          || event.type == EventType::OperativeConverted;
        disruptionResolved = disruptionResolved || event.type == EventType::DisruptionQueued;
    }
    require(victoryEvent, "La simulacion termino sin emitir VictoryDeclared.");

    return ReplayResult{engine.historyDigest(), engine.victory(), engine.tree().snapshot(),
                        trojanResolved, disruptionResolved};
}

void testResolveRequiresPendingDecision() {
    GameEngine idle;
    AIController ai;
    std::string error;
    require(!ai.resolve(idle, &error),
            "resolve acepto una llamada sin PendingDecision.");
    require(!error.empty(), "resolve no explico la ausencia de PendingDecision.");
}

void testSeededReplayIsExact(const std::filesystem::path& dataDirectory) {
    constexpr std::uint64_t seed = 0x5947474452415349ULL;
    const ReplayResult first = play(dataDirectory, seed);
    const ReplayResult second = play(dataDirectory, seed);

    require(first.digest == second.digest,
            "La misma semilla produjo historiales distintos.");
    require(first.victory.winner == second.victory.winner,
            "La misma semilla produjo ganadores distintos.");
    require(first.victory.reason == second.victory.reason,
            "La misma semilla produjo motivos de victoria distintos.");
    require(first.tree.size == second.tree.size && first.tree.height == second.tree.height,
            "La misma semilla produjo topologias finales distintas.");
    require(first.trojanResolved,
            "La partida de replay no ejercito la seleccion de objetivo de Troyano.");
    require(first.disruptionResolved,
            "La partida de replay no ejercito la seleccion de Disrupcion.");
}

void testSeveralSeedsFinish(const std::filesystem::path& dataDirectory) {
    constexpr std::array<std::uint64_t, 4> seeds{
        1ULL,
        7ULL,
        0xC0FFEEULL,
        0xDEADBEEF1234ULL,
    };
    for (const std::uint64_t seed : seeds) {
        (void)play(dataDirectory, seed, 6);
    }
}

void testManualModeCompletesTheSharedDecisionContract(
    const std::filesystem::path& dataDirectory) {
    constexpr std::uint64_t seed = 0x5947474452415349ULL;
    const ReplayResult result = play(dataDirectory, seed, 8, GameMode::Manual);
    require(result.trojanResolved,
            "El flujo Manual completo no alcanzo una decision de Troyano.");
    require(result.disruptionResolved,
            "El flujo Manual completo no alcanzo una decision de Disrupcion.");
}

void testManualWorkshopCrud(const std::filesystem::path& dataDirectory) {
    GameEngine engine;
    require(engine.loadCatalogs(dataDirectory), "No se pudieron cargar los catalogos.");
    GameConfig config;
    config.mode = GameMode::Manual;
    config.maxTurns = 6;
    config.seed = 0xC0DEC0DEULL;
    engine.start(config);

    AIController decisionProvider;
    std::string error;
    for (int cycle = 0;
         cycle < 10'000 && !(engine.canUseWorkshop() && !engine.tree().empty());
         ++cycle) {
        if (engine.hasPendingDecision()) {
            require(decisionProvider.resolve(engine, &error),
                    "No se pudo preparar el taller Manual: " + error);
        } else if (engine.awaitingWorkshop() && engine.tree().empty()) {
            require(engine.continueWorkshop(&error),
                    "No se pudo cerrar el primer taller vacio: " + error);
        } else {
            engine.pump();
        }
    }
    require(engine.canUseWorkshop() && !engine.tree().empty(),
            "El taller Manual no estuvo disponible con un operativo existente.");

    int operativeId = engine.tree().inOrder().front().id;
    const Operative original = *engine.tree().find(operativeId);
    auto edit = [&](const EditCommand& command) {
        error.clear();
        const bool accepted = engine.editOperative(command, &error);
        require(accepted, "Edicion Manual rechazada: " + error);
        require(engine.tree().validate().valid, "El taller dano el arbol B-4.");
    };
    auto command = [&](const EditKind kind, const int value = 0,
                       const int catalogIndex = 0, const int itemIndex = 0,
                       std::string text = {}) {
        EditCommand result;
        result.kind = kind;
        result.operativeId = operativeId;
        result.value = value;
        result.catalogIndex = catalogIndex;
        result.itemIndex = itemIndex;
        result.text = std::move(text);
        return result;
    };

    const int editedHp = original.baseHp < 10'000 ? original.baseHp + 1 : original.baseHp - 1;
    edit(command(EditKind::SetHealth, editedHp));
    require(engine.tree().find(operativeId)->baseHp == editedHp,
            "SetHealth no actualizo HP/baseHp.");

    const int editedAttack = original.attack < 10'000 ? original.attack + 1 : original.attack - 1;
    edit(command(EditKind::SetAttack, editedAttack));
    require(engine.tree().find(operativeId)->attack == editedAttack,
            "SetAttack no actualizo el ataque.");

    const int editedSpeed = original.speed < 10'000 ? original.speed + 1 : original.speed - 1;
    edit(command(EditKind::SetSpeed, editedSpeed));
    require(engine.tree().find(operativeId)->speed == editedSpeed,
            "SetSpeed no actualizo la rapidez.");

    edit(command(EditKind::SetName, 0, 0, 0, "Operativo Ñ"));
    require(engine.tree().find(operativeId)->name == "Operativo Ñ",
            "SetName no preservo el nombre UTF-8.");

    EditCommand templateCommand = command(EditKind::ApplyTemplate, 0, 0);
    templateCommand.templateKind = yggdrasil::TemplateKind::Character;
    edit(templateCommand);
    const auto& templateSource = engine.catalogs().characters().front();
    require(engine.tree().find(operativeId)->name == templateSource.name &&
                engine.tree().find(operativeId)->baseHp == templateSource.health &&
                engine.tree().find(operativeId)->speed == templateSource.speed,
            "ApplyTemplate no copio el molde de personaje.");

    const Faction originalFaction = engine.tree().find(operativeId)->faction;
    edit(command(EditKind::ToggleFaction));
    require(engine.tree().find(operativeId)->faction != originalFaction,
            "ToggleFaction no cambio la faccion.");
    edit(command(EditKind::ToggleFaction));
    require(engine.tree().find(operativeId)->faction == originalFaction,
            "ToggleFaction no pudo restaurar la faccion.");

    require(engine.tree().find(operativeId)->weapons.size() == 1,
            "El operativo de catalogo debe iniciar con un arma.");
    edit(command(EditKind::SetWeaponDamage, 321, 0, 0));
    edit(command(EditKind::SetWeaponUseCost, 17, 0, 0));
    edit(command(EditKind::SetWeaponId, 90'001, 0, 0));
    edit(command(EditKind::SetWeaponAmmo, 222, 0, 0));
    edit(command(EditKind::SetWeaponName, 0, 0, 0, "Arma Ñ"));
    const auto& editedWeapon = engine.tree().find(operativeId)->weapons.front();
    require(editedWeapon.damage == 321 && editedWeapon.useCost == 17 &&
                editedWeapon.id == 90'001 && editedWeapon.ammunition == 222 &&
                editedWeapon.name == "Arma Ñ",
            "La edicion interna de arma no aplico todos los campos canonicos.");

    edit(command(EditKind::AddWeapon, 0, 0));
    require(engine.tree().find(operativeId)->weapons.size() == 2,
            "AddWeapon no encolo al final.");
    error.clear();
    EditCommand duplicateWeapon = command(EditKind::AddWeapon, 0, 0);
    require(!engine.editOperative(duplicateWeapon, &error) && !error.empty(),
            "AddWeapon acepto un ID interno duplicado.");
    edit(command(EditKind::DeleteWeapon, 0, 0, 1));
    require(engine.tree().find(operativeId)->weapons.size() == 1 &&
                engine.tree().find(operativeId)->weapons.front().id == 90'001,
            "DeleteWeapon interno altero el orden FIFO restante.");
    edit(command(EditKind::RemoveActiveWeapon));
    require(engine.tree().find(operativeId)->weapons.empty(),
            "RemoveActiveWeapon no retiro el frente FIFO.");

    edit(command(EditKind::ToggleHero));
    require(engine.tree().find(operativeId)->isHero &&
                engine.tree().find(operativeId)->weapons.size() == 2 &&
                engine.tree().find(operativeId)->weapons[0].id !=
                    engine.tree().find(operativeId)->weapons[1].id,
            "ToggleHero no encolo dos habilidades con IDs unicos.");
    edit(command(EditKind::ToggleHero));
    require(!engine.tree().find(operativeId)->isHero &&
                engine.tree().find(operativeId)->weapons.empty(),
            "ToggleHero no retiro habilidades activas del frente.");

    require(engine.tree().find(operativeId)->shields.size() == 1,
            "El operativo de catalogo debe iniciar con un escudo.");
    edit(command(EditKind::SetShieldAbsorption, 432, 0, 0));
    edit(command(EditKind::SetShieldDurability, 87, 0, 0));
    edit(command(EditKind::SetShieldId, 90'002, 0, 0));
    edit(command(EditKind::SetShieldName, 0, 0, 0, "Escudo Ñ"));
    edit(command(EditKind::SetShieldWeight, 13, 0, 0));
    const auto& editedShield = engine.tree().find(operativeId)->shields.front();
    require(editedShield.absorption == 432 && editedShield.durability == 87 &&
                editedShield.id == 90'002 && editedShield.name == "Escudo Ñ" &&
                editedShield.weight == 13,
            "La edicion interna de escudo no aplico todos los campos canonicos.");

    edit(command(EditKind::AddShield, 0, 0));
    require(engine.tree().find(operativeId)->shields.size() == 2,
            "AddShield no apilo en el tope.");
    error.clear();
    EditCommand duplicateShield = command(EditKind::AddShield, 0, 0);
    require(!engine.editOperative(duplicateShield, &error) && !error.empty(),
            "AddShield acepto un ID interno duplicado.");
    const int topShieldId = engine.tree().find(operativeId)->shields.back().id;
    edit(command(EditKind::DeleteShield, 0, 0, 0));
    require(engine.tree().find(operativeId)->shields.size() == 1 &&
                engine.tree().find(operativeId)->shields.back().id == topShieldId,
            "DeleteShield interno altero el orden LIFO restante.");
    edit(command(EditKind::RemoveActiveShield));
    require(engine.tree().find(operativeId)->shields.empty(),
            "RemoveActiveShield no retiro el tope LIFO.");

    const std::vector<int> freeIds = engine.freeIds();
    require(!freeIds.empty(), "No habia ID libre para probar ChangeId.");
    const int movedId = freeIds.front();
    edit(command(EditKind::ChangeId, movedId));
    require(engine.tree().find(operativeId) == nullptr && engine.tree().find(movedId) != nullptr,
            "ChangeId no borro y reinserto la clave.");
    operativeId = movedId;

    edit(command(EditKind::DeleteOperative));
    require(engine.tree().find(operativeId) == nullptr,
            "DeleteOperative no retiro la clave.");
}

void testSameEngineRestartsExactly(const std::filesystem::path& dataDirectory) {
    GameEngine engine;
    require(engine.loadCatalogs(dataDirectory), "No se pudieron cargar los catalogos.");
    AIController ai;
    GameConfig config;
    config.mode = GameMode::AiVsAi;
    config.maxTurns = 8;
    config.seed = 0xA11CE55ULL;

    auto run = [&]() {
        engine.start(config);
        std::string error;
        require(ai.runHeadless(engine, 100'000, &error),
                "El reinicio automatico fallo: " + error);
        return std::pair{engine.historyDigest(), engine.victory()};
    };

    const auto first = run();
    const auto second = run();
    require(first.first == second.first,
            "Reiniciar la misma instancia con igual semilla cambio el historial.");
    require(first.second.winner == second.second.winner &&
                first.second.reason == second.second.reason,
            "Reiniciar la misma instancia cambio el resultado.");
}

} // namespace

int main() {
    try {
        const std::filesystem::path dataDirectory = findDataDirectory();
        testResolveRequiresPendingDecision();
        testSeededReplayIsExact(dataDirectory);
        testManualModeCompletesTheSharedDecisionContract(dataDirectory);
        testManualWorkshopCrud(dataDirectory);
        testSeveralSeedsFinish(dataDirectory);
        testSameEngineRestartsExactly(dataDirectory);
        std::cout << "test_ai: OK\n";
        return 0;
    } catch (const std::exception& exception) {
        std::cerr << "test_ai: FAIL: " << exception.what() << '\n';
        return 1;
    }
}
