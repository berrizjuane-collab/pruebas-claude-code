#include "yggdrasil/ui/game_app.hpp"

#include "yggdrasil/ai/ai_controller.hpp"
#include "yggdrasil/core/game_engine.hpp"

#include <raylib.h>

#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <deque>
#include <functional>
#include <limits>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

namespace yggdrasil::ui {
namespace {

constexpr Color kVoid{5, 8, 22, 255};
constexpr Color kPanel{9, 16, 35, 238};
constexpr Color kPanelSoft{14, 25, 48, 220};
constexpr Color kCyan{35, 235, 246, 255};
constexpr Color kCyanSoft{35, 235, 246, 80};
constexpr Color kMagenta{255, 55, 160, 255};
constexpr Color kMagentaSoft{255, 55, 160, 80};
constexpr Color kAmber{255, 190, 70, 255};
constexpr Color kGreen{95, 255, 160, 255};
constexpr Color kRed{255, 86, 99, 255};
constexpr Color kText{222, 239, 249, 255};
constexpr Color kMuted{118, 151, 176, 255};
constexpr Color kLine{48, 80, 111, 255};

constexpr float kHeaderHeight = 78.0F;
constexpr float kFooterHeight = 62.0F;
constexpr float kSideWidth = 344.0F;
constexpr float kNodeWidth = 292.0F;
constexpr float kNodeHeight = 108.0F;
constexpr float kNodeGapX = 326.0F;
constexpr float kNodeGapY = 178.0F;

Color withAlpha(Color color, const unsigned char alpha) {
    color.a = alpha;
    return color;
}

Color factionColor(const Faction faction) {
    if (faction == Faction::Neon) return kCyan;
    if (faction == Faction::Omega) return kMagenta;
    return kMuted;
}

const char* factionMarker(const Faction faction) {
    if (faction == Faction::Neon) return "N";
    if (faction == Faction::Omega) return "O";
    return "-";
}

std::string ellipsis(std::string_view text, const std::size_t maximum) {
    std::size_t codepoints = 0;
    for (const unsigned char byte : text) {
        if ((byte & 0xC0U) != 0x80U) ++codepoints;
    }
    if (codepoints <= maximum) return std::string(text);
    if (maximum <= 3) return std::string(maximum, '.');
    const std::size_t wanted = maximum - 3;
    std::size_t seen = 0;
    std::size_t bytes = 0;
    while (bytes < text.size() && seen < wanted) {
        if ((static_cast<unsigned char>(text[bytes]) & 0xC0U) != 0x80U) ++seen;
        ++bytes;
        while (bytes < text.size() &&
               (static_cast<unsigned char>(text[bytes]) & 0xC0U) == 0x80U) {
            ++bytes;
        }
    }
    return std::string(text.substr(0, bytes)) + "...";
}

template <typename Integer>
bool parseInteger(const std::string& text, Integer& result) {
    if (text.empty()) return false;
    const char* first = text.data();
    const char* last = first + text.size();
    const auto parsed = std::from_chars(first, last, result);
    return parsed.ec == std::errc{} && parsed.ptr == last;
}

const char* recruitmentName(const RecruitmentMode mode) {
    switch (mode) {
    case RecruitmentMode::Catalog: return "CATALOGO";
    case RecruitmentMode::QuickClass: return "CLASE RAPIDA";
    case RecruitmentMode::Custom: return "PERSONALIZADO";
    }
    return "CATALOGO";
}

const char* effectLabel(const EventType type) {
    switch (type) {
    case EventType::AttackStarted: return "ATAQUE";
    case EventType::ShieldBroken: return "ESCUDO ROTO";
    case EventType::OperativeConverted: return "TROYANO";
    case EventType::DisruptionQueued:
    case EventType::OperativeRelocated: return "DISRUPCION";
    case EventType::NodeSplit: return "SPLIT";
    case EventType::NodeBorrowed: return "BORROW";
    case EventType::NodesMerged: return "MERGE";
    case EventType::RootReduced: return "RAIZ";
    default: return "IMPACTO";
    }
}

enum class Screen { MainMenu, Setup, Battle, HowTo, Arsenal, Settings, Victory };
enum class Modal { None, Recruit, Trojan, Disruption, Workshop, Help };

struct Star {
    float x{};
    float y{};
    float depth{};
    float size{};
    Color color{};
};

struct NodeVisual {
    BTree::NodeId id{};
    int depth{};
    Vector2 center{};
    Rectangle bounds{};
    std::array<Rectangle, 3> slots{};
};

enum class EffectFlavor {
    Generic,
    Plasma,
    Gauss,
    IonBlade,
    Emp,
    Malware,
    Kinetic,
    Deflector,
    Reactive,
    Firewall,
    Camouflage,
    Trojan,
    Disruption,
    Split,
    Borrow,
    Merge,
    RootReduction,
};

EffectFlavor effectFlavor(const GameEvent& event) {
    const auto contains = [&](const std::string_view needle) {
        return event.title.find(needle) != std::string::npos ||
               event.detail.find(needle) != std::string::npos;
    };
    if (event.type == EventType::NodeSplit) return EffectFlavor::Split;
    if (event.type == EventType::NodeBorrowed) return EffectFlavor::Borrow;
    if (event.type == EventType::NodesMerged) return EffectFlavor::Merge;
    if (event.type == EventType::RootReduced) return EffectFlavor::RootReduction;
    if (event.type == EventType::OperativeConverted) return EffectFlavor::Trojan;
    if (event.type == EventType::TrojanBlocked) return EffectFlavor::Firewall;
    if (event.type == EventType::DisruptionQueued ||
        event.type == EventType::OperativeRelocated) return EffectFlavor::Disruption;
    if (event.type == EventType::ReactiveDamage || contains("Reactivo") || contains("reactivo"))
        return EffectFlavor::Reactive;
    if (event.type == EventType::AttackEvaded || contains("Camuflaje") || contains("camuflaje"))
        return EffectFlavor::Camouflage;
    if (contains("Deflector")) return EffectFlavor::Deflector;
    if (contains("Barrera de Energ")) return EffectFlavor::Kinetic;
    if (contains("Cortafuegos")) return EffectFlavor::Firewall;
    if (contains("Plasma")) return EffectFlavor::Plasma;
    if (contains("Gauss")) return EffectFlavor::Gauss;
    if (contains("Iones")) return EffectFlavor::IonBlade;
    if (contains("Electromagn") || contains("EMP")) return EffectFlavor::Emp;
    if (contains("Malware") || contains("malware")) return EffectFlavor::Malware;
    return EffectFlavor::Generic;
}

const char* flavorLabel(const EffectFlavor flavor, const EventType fallback) {
    switch (flavor) {
    case EffectFlavor::Plasma: return "PLASMA";
    case EffectFlavor::Gauss: return "GAUSS";
    case EffectFlavor::IonBlade: return "IONES";
    case EffectFlavor::Emp: return "EMP";
    case EffectFlavor::Malware: return "MALWARE";
    case EffectFlavor::Kinetic: return "BARRERA";
    case EffectFlavor::Deflector: return "DEFLECTOR";
    case EffectFlavor::Reactive: return "REBOTE";
    case EffectFlavor::Firewall: return "FIREWALL";
    case EffectFlavor::Camouflage: return "CAMUFLAJE";
    case EffectFlavor::Trojan: return "TROYANO";
    case EffectFlavor::Disruption: return "DISRUPCION";
    case EffectFlavor::Split: return "SPLIT";
    case EffectFlavor::Borrow: return "BORROW";
    case EffectFlavor::Merge: return "MERGE";
    case EffectFlavor::RootReduction: return "RAIZ";
    case EffectFlavor::Generic: return effectLabel(fallback);
    }
    return effectLabel(fallback);
}

struct VisualEffect {
    EventType type{EventType::Information};
    EffectFlavor flavor{EffectFlavor::Generic};
    int sourceId{};
    int targetId{};
    BTree::NodeId nodeId{};
    int amount{};
    float age{};
    float duration{1.0F};
};

float speedValue(const int index) {
    static constexpr std::array<float, 5> values{0.5F, 1.0F, 2.0F, 4.0F, 16.0F};
    return values[static_cast<std::size_t>(std::clamp(index, 0, 4))];
}

const char* speedLabel(const int index) {
    static constexpr std::array<const char*, 5> labels{"0.5x", "1x", "2x", "4x", "RAPIDO"};
    return labels[static_cast<std::size_t>(std::clamp(index, 0, 4))];
}

} // namespace

struct GameApp::Impl {
    explicit Impl(AppOptions appOptions) : options(std::move(appOptions)) {
        for (int index = 0; index < 210; ++index) {
            const std::uint32_t hash = static_cast<std::uint32_t>(index * 747796405U + 2891336453U);
            const float depth = 0.18F + static_cast<float>((hash >> 8U) % 82U) / 100.0F;
            stars.push_back({static_cast<float>(hash % 4096U) / 4096.0F,
                             static_cast<float>((hash >> 12U) % 4096U) / 4096.0F,
                             depth,
                             1.0F + static_cast<float>((hash >> 25U) % 3U),
                             (index % 9 == 0) ? kMagenta : kCyan});
        }
    }

    AppOptions options;
    GameEngine engine;
    AIController ai;
    GameConfig config{};
    Screen screen{Screen::MainMenu};
    Screen returnScreen{Screen::MainMenu};
    Modal modal{Modal::None};
    bool running{true};
    bool paused{false};
    bool turnStepping{false};
    bool pendingModalDeferred{false};
    int stepUntilTurn{0};
    bool showInspector{true};
    bool effectsReduced{false};
    bool rulesConfirmed{false};
    bool fullscreen{false};
    int speedIndex{1};
    int activeField{0};
    int selectedOperative{0};
    BTree::NodeId selectedNode{0};
    float eventClock{0.0F};
    float menuClock{0.0F};
    float logScroll{0.0F};
    bool logFollowTail{true};
    float inspectorScroll{0.0F};
    float arsenalScroll{0.0F};
    std::string errorMessage;
    std::string seedText{"6433195119881040713"};
    std::string turnText{"10"};
    std::string recruitId{"250"};
    std::string customName{"Nexo"};
    std::string customHp{"100"};
    std::string customAttack{"50"};
    std::string customSpeed{"70"};
    std::string workshopHp;
    std::string workshopAttack;
    std::string workshopSpeed;
    std::string workshopId;
    std::string workshopName;
    std::string workshopItemName;
    std::string workshopItemId;
    std::string workshopValueA;
    std::string workshopValueB;
    std::string workshopValueC;
    std::string disruptionDestination{"1"};
    RecruitmentMode recruitmentMode{RecruitmentMode::Catalog};
    TemplateKind templateKind{TemplateKind::Species};
    int templateIndex{0};
    int quickClass{3};
    int weaponIndex{0};
    int shieldIndex{0};
    int tacticalTarget{0};
    int tacticalPage{0};
    int workshopWeapon{0};
    int workshopShield{0};
    int workshopTab{0};
    int workshopItem{0};
    int workshopTemplate{0};
    TemplateKind workshopTemplateKind{TemplateKind::Species};
    bool deleteArmed{false};
    bool seedCopied{false};
    std::vector<Star> stars;
    std::deque<GameEvent> visibleEvents;
    std::vector<VisualEffect> effects;
    std::vector<NodeVisual> nodeVisuals;
    std::unordered_map<int, Vector2> operativePositions;
    std::unordered_map<BTree::NodeId, Vector2> nodePositions;
    Rectangle treeViewport{};
    Camera2D camera{{0.0F, 0.0F}, {0.0F, 0.0F}, 0.0F, 1.0F};
    Vector2 treeCenter{};
    Vector2 treeExtents{500.0F, 300.0F};
    bool cameraNeedsCenter{true};
    int screenshotFrames{0};
    bool screenshotSaved{true};

    [[nodiscard]] int run();
    void prepareScreenshot();
    void update(float delta);
    void updateBattle(float delta);
    void advanceEngineUnit(bool forceEventPop = false);
    void continueAction();
    void consumeEvent(GameEvent event);
    void openPendingModal();
    void beginGame(GameMode mode);
    void resetRecruitForm();
    void openWorkshop();
    void syncWorkshopFields();
    void centerCamera();
    void rebuildTreeLayout();
    void updateCamera(float delta);

    void draw();
    void drawBackground(float intensity = 1.0F) const;
    void drawMainMenu();
    void drawSetup();
    void drawHowTo();
    void drawArsenal();
    void drawSettings();
    void drawBattle();
    void drawVictory();
    void drawTree(bool interactive);
    void drawNode(const NodeSnapshot& snapshot, const NodeVisual& visual, bool interactive);
    void drawOperative(const Operative& operative, Rectangle slot, bool selected) const;
    void drawEffects();
    void drawBattleHeader(const GameSnapshot& snapshot);
    void drawInspector(const GameSnapshot& snapshot);
    void drawEventLog();
    void drawBattleFooter();
    void drawModalShade() const;
    void drawRecruitModal();
    void drawTacticalModal(bool disruption);
    void drawWorkshopModal();
    void drawHelpModal();

    [[nodiscard]] bool button(Rectangle bounds, std::string_view label, bool enabled = true,
                              Color accent = kCyan, int fontSize = 18) const;
    bool textField(Rectangle bounds, std::string& value, int id, bool numeric,
                   std::size_t maximum, std::string_view placeholder = {},
                   bool allowSign = false);
    void label(std::string_view text, Vector2 position, int size = 18, Color color = kText) const;
    void centered(std::string_view text, Rectangle bounds, int size, Color color = kText) const;
    void panel(Rectangle bounds, Color edge = kLine, unsigned char alpha = 230) const;
    void wrapped(std::string_view text, Rectangle bounds, int size, Color color = kText,
                 float lineSpacing = 4.0F) const;
    void selector(Rectangle bounds, std::string_view value, int& index, int count,
                  Color accent = kCyan);
    [[nodiscard]] Rectangle modalRect(float width, float height) const;
    [[nodiscard]] RecruitCommand recruitCommand() const;
    [[nodiscard]] const Operative* selected() const;
    void applyWorkshop(EditCommand command);
};

GameApp::GameApp(AppOptions options) : impl_(new Impl(std::move(options))) {}
GameApp::~GameApp() { delete impl_; }
int GameApp::run() { return impl_->run(); }

int GameApp::Impl::run() {
    unsigned int flags = FLAG_WINDOW_RESIZABLE | FLAG_MSAA_4X_HINT;
    if (options.smokeTest) flags |= FLAG_WINDOW_HIDDEN;
    SetConfigFlags(flags);
    InitWindow(1440, 900, "OPERACION YGGDRASIL // ARBOL DE GUERRA");
    if (!IsWindowReady()) return 1;
    SetWindowMinSize(1080, 680);
    SetTargetFPS(60);

    const bool loaded = engine.loadCatalogs(options.dataDirectory, options.executablePath);
    if (!loaded) {
        errorMessage = "No se cargaron todos los catalogos. Use --data-dir RUTA.";
    }

    std::filesystem::path screenshotOutput;
    if (!options.screenshotPath.empty()) {
        std::error_code pathError;
        screenshotOutput = std::filesystem::absolute(options.screenshotPath, pathError);
        if (!pathError && !screenshotOutput.parent_path().empty()) {
            std::filesystem::create_directories(screenshotOutput.parent_path(), pathError);
        }
        screenshotSaved = !pathError;
        if (!screenshotSaved) {
            TraceLog(LOG_ERROR, "No se pudo preparar la ruta de captura: %s",
                     options.screenshotPath.string().c_str());
        }
        prepareScreenshot();
    }

    int smokeFrames = 0;
    while (running && !WindowShouldClose()) {
        const float delta = std::min(GetFrameTime(), 0.1F);
        update(delta);
        BeginDrawing();
        draw();
        EndDrawing();

        if (!options.screenshotPath.empty()) {
            ++screenshotFrames;
            if (screenshotFrames == 3) {
                if (screenshotSaved) {
                    Image frame = LoadImageFromScreen();
                    screenshotSaved = ExportImage(frame, screenshotOutput.string().c_str());
                    UnloadImage(frame);
                }
                running = false;
            }
        }
        if (options.smokeTest && ++smokeFrames >= 8) running = false;
    }
    CloseWindow();
    if (!loaded) return 3;
    return screenshotSaved ? 0 : 4;
}

void GameApp::Impl::prepareScreenshot() {
    config.mode = GameMode::AiVsAi;
    config.maxTurns = 12;
    config.seed = 0x5947474452415349ULL;
    config.visualSpeed = 4.0F;
    config.reducedEffects = false;
    engine.start(config);
    std::string failure;
    for (int cycle = 0; cycle < 5000 && !engine.gameOver(); ++cycle) {
        const GameSnapshot state = engine.snapshot();
        if (state.turn >= 5 && state.tree.size >= 5 && !engine.hasPendingDecision()) break;
        if (engine.hasPendingDecision()) {
            if (!ai.resolve(engine, &failure)) break;
        } else {
            engine.pump();
        }
        engine.discardQueuedEvents();
    }
    screen = Screen::Battle;
    paused = true;
    cameraNeedsCenter = true;
    visibleEvents.clear();
    const auto& history = engine.history();
    const std::size_t begin = history.size() > 8 ? history.size() - 8 : 0;
    for (std::size_t index = begin; index < history.size(); ++index) visibleEvents.push_back(history[index]);
}

void GameApp::Impl::label(const std::string_view text, const Vector2 position,
                          const int size, const Color color) const {
    DrawTextEx(GetFontDefault(), std::string(text).c_str(), position,
               static_cast<float>(size), 1.0F, color);
}

void GameApp::Impl::centered(const std::string_view text, const Rectangle bounds,
                             const int size, const Color color) const {
    const std::string copy(text);
    const Vector2 measured = MeasureTextEx(GetFontDefault(), copy.c_str(),
                                           static_cast<float>(size), 1.0F);
    label(copy, {bounds.x + (bounds.width - measured.x) * 0.5F,
                 bounds.y + (bounds.height - measured.y) * 0.5F}, size, color);
}

void GameApp::Impl::panel(const Rectangle bounds, const Color edge,
                          const unsigned char alpha) const {
    DrawRectangleRounded(bounds, 0.08F, 8, withAlpha(kPanel, alpha));
    DrawRectangleRoundedLinesEx(bounds, 0.08F, 8, 1.0F, withAlpha(edge, 190));
    DrawLineEx({bounds.x + 12.0F, bounds.y + 5.0F},
               {bounds.x + std::min(90.0F, bounds.width - 12.0F), bounds.y + 5.0F},
               2.0F, edge);
}

bool GameApp::Impl::button(const Rectangle bounds, const std::string_view text,
                           const bool enabled, const Color accent, const int fontSize) const {
    const Vector2 mouse = GetMousePosition();
    const bool hovered = enabled && CheckCollisionPointRec(mouse, bounds);
    DrawRectangleRounded(bounds, 0.12F, 6,
                         enabled ? (hovered ? withAlpha(accent, 55) : withAlpha(kPanelSoft, 245))
                                 : Color{12, 18, 28, 215});
    DrawRectangleRoundedLinesEx(bounds, 0.12F, 6, hovered ? 2.0F : 1.0F,
                                enabled ? (hovered ? accent : withAlpha(accent, 145))
                                        : Color{50, 58, 70, 180});
    if (enabled && hovered) {
        DrawRectangle(static_cast<int>(bounds.x + 4.0F), static_cast<int>(bounds.y + 5.0F),
                      3, static_cast<int>(bounds.height - 10.0F), accent);
    }
    centered(text, bounds, fontSize, enabled ? kText : Color{77, 88, 101, 255});
    return hovered && IsMouseButtonReleased(MOUSE_BUTTON_LEFT);
}

bool GameApp::Impl::textField(const Rectangle bounds, std::string& value, const int id,
                              const bool numeric, const std::size_t maximum,
                              const std::string_view placeholder, const bool allowSign) {
    const bool hovered = CheckCollisionPointRec(GetMousePosition(), bounds);
    if (hovered && IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) activeField = id;
    const bool active = activeField == id;
    DrawRectangleRounded(bounds, 0.08F, 5, withAlpha(kVoid, 235));
    DrawRectangleRoundedLinesEx(bounds, 0.08F, 5, active ? 2.0F : 1.0F,
                                active ? kCyan : (hovered ? kMuted : kLine));

    bool changed = false;
    if (active) {
        int codepoint = GetCharPressed();
        while (codepoint > 0) {
            if (numeric) {
                const bool digit = codepoint >= '0' && codepoint <= '9';
                const bool sign = allowSign && codepoint == '-' && value.empty();
                if ((digit || sign) && value.size() < maximum) {
                    value.push_back(static_cast<char>(codepoint));
                    changed = true;
                }
            } else if (codepoint >= 32 && codepoint <= 0x10FFFF &&
                       !(codepoint >= 0xD800 && codepoint <= 0xDFFF)) {
                int byteCount = 0;
                const char* encoded = CodepointToUTF8(codepoint, &byteCount);
                if (encoded != nullptr && byteCount > 0 &&
                    value.size() + static_cast<std::size_t>(byteCount) <= maximum) {
                    value.append(encoded, static_cast<std::size_t>(byteCount));
                    changed = true;
                }
            }
            codepoint = GetCharPressed();
        }
        if (IsKeyPressed(KEY_BACKSPACE) && !value.empty()) {
            std::size_t start = value.size() - 1;
            while (start > 0 &&
                   (static_cast<unsigned char>(value[start]) & 0xC0U) == 0x80U) {
                --start;
            }
            value.erase(start);
            changed = true;
        }
        if (IsKeyPressed(KEY_ENTER) || IsKeyPressed(KEY_ESCAPE) || IsKeyPressed(KEY_TAB)) {
            activeField = 0;
        }
    }

    const std::string shown = value.empty() ? std::string(placeholder) : value;
    label(ellipsis(shown, std::max<std::size_t>(1, static_cast<std::size_t>(bounds.width / 10.0F))),
          {bounds.x + 10.0F, bounds.y + (bounds.height - 18.0F) * 0.5F}, 18,
          value.empty() ? kMuted : kText);
    if (active && static_cast<int>(GetTime() * 2.0) % 2 == 0) {
        const float width = MeasureTextEx(GetFontDefault(), shown.c_str(), 18.0F, 1.0F).x;
        DrawRectangle(static_cast<int>(std::min(bounds.x + bounds.width - 8.0F,
                                                bounds.x + 10.0F + width + 2.0F)),
                      static_cast<int>(bounds.y + 9.0F), 2,
                      static_cast<int>(bounds.height - 18.0F), kCyan);
    }
    return changed;
}

void GameApp::Impl::wrapped(const std::string_view text, const Rectangle bounds,
                            const int size, const Color color, const float lineSpacing) const {
    const float maxWidth = std::max(20.0F, bounds.width);
    std::string line;
    std::string word;
    float y = bounds.y;
    auto flushLine = [&]() {
        if (line.empty() || y + static_cast<float>(size) > bounds.y + bounds.height) return;
        label(line, {bounds.x, y}, size, color);
        y += static_cast<float>(size) + lineSpacing;
        line.clear();
    };
    for (std::size_t index = 0; index <= text.size(); ++index) {
        const char character = index < text.size() ? text[index] : ' ';
        if (character == '\n') {
            if (!word.empty()) {
                if (!line.empty()) line += ' ';
                line += word;
                word.clear();
            }
            flushLine();
            continue;
        }
        if (character != ' ' && index < text.size()) {
            word.push_back(character);
            continue;
        }
        if (word.empty()) continue;
        std::string candidate = line.empty() ? word : line + " " + word;
        if (!line.empty() && MeasureTextEx(GetFontDefault(), candidate.c_str(),
                                           static_cast<float>(size), 1.0F).x > maxWidth) {
            flushLine();
            line = word;
        } else {
            line = std::move(candidate);
        }
        word.clear();
    }
    flushLine();
}

void GameApp::Impl::selector(const Rectangle bounds, const std::string_view value,
                             int& index, const int count, const Color accent) {
    const Rectangle left{bounds.x, bounds.y, 38.0F, bounds.height};
    const Rectangle right{bounds.x + bounds.width - 38.0F, bounds.y, 38.0F, bounds.height};
    panel(bounds, accent, 220);
    centered(ellipsis(value, static_cast<std::size_t>(std::max(5.0F, bounds.width / 10.0F))),
             {bounds.x + 42.0F, bounds.y, bounds.width - 84.0F, bounds.height}, 16, kText);
    if (button(left, "<", count > 1, accent, 20)) index = (index + count - 1) % count;
    if (button(right, ">", count > 1, accent, 20)) index = (index + 1) % count;
}

Rectangle GameApp::Impl::modalRect(const float width, const float height) const {
    return {(static_cast<float>(GetScreenWidth()) - width) * 0.5F,
            (static_cast<float>(GetScreenHeight()) - height) * 0.5F,
            width, height};
}

void GameApp::Impl::drawModalShade() const {
    DrawRectangle(0, 0, GetScreenWidth(), GetScreenHeight(), Color{1, 3, 12, 205});
}

void GameApp::Impl::beginGame(const GameMode mode) {
    std::uint64_t parsedSeed = 0;
    int parsedTurns = 10;
    if (!parseInteger(seedText, parsedSeed)) parsedSeed = 0x5947474452415349ULL;
    if (!parseInteger(turnText, parsedTurns)) parsedTurns = 10;
    parsedTurns = std::clamp(parsedTurns, 2, 60);
    if (parsedTurns % 2 != 0) ++parsedTurns;
    turnText = std::to_string(parsedTurns);
    seedText = std::to_string(parsedSeed);
    config = {mode, parsedTurns, parsedSeed, speedValue(speedIndex), effectsReduced};
    engine.start(config);
    visibleEvents.clear();
    effects.clear();
    errorMessage.clear();
    selectedOperative = 0;
    selectedNode = 0;
    paused = false;
    turnStepping = false;
    pendingModalDeferred = false;
    modal = Modal::None;
    activeField = 0;
    screen = Screen::Battle;
    camera.target = {0.0F, 0.0F};
    camera.zoom = 1.0F;
    cameraNeedsCenter = true;
    eventClock = 1.0F;
}

void GameApp::Impl::resetRecruitForm() {
    const PendingDecision decision = engine.pendingDecision();
    recruitmentMode = RecruitmentMode::Catalog;
    templateKind = decision.heroOnly ? TemplateKind::Hero : TemplateKind::Species;
    templateIndex = 0;
    quickClass = 3;
    weaponIndex = 0;
    shieldIndex = 0;
    customName = "Nexo";
    customHp = "100";
    customAttack = "50";
    customSpeed = "70";
    const std::vector<int> free = engine.freeIds();
    int preferred = 250;
    if (quickClass == 3) {
        const auto found = std::find_if(free.begin(), free.end(), [](const int id) { return id <= 499; });
        if (found != free.end()) preferred = *found;
    }
    recruitId = std::to_string(preferred);
    activeField = 0;
    errorMessage.clear();
}

void GameApp::Impl::syncWorkshopFields() {
    const Operative* operative = selected();
    if (!operative) return;
    workshopName = operative->name;
    workshopHp = std::to_string(operative->baseHp);
    workshopAttack = std::to_string(operative->attack);
    workshopSpeed = std::to_string(operative->speed);
    workshopId = std::to_string(operative->id);

    if (workshopTab == 1 && !operative->weapons.empty()) {
        workshopItem = std::clamp(workshopItem, 0,
                                  static_cast<int>(operative->weapons.size()) - 1);
        const Weapon& weapon = operative->weapons[static_cast<std::size_t>(workshopItem)];
        workshopItemName = weapon.name;
        workshopItemId = std::to_string(weapon.id);
        workshopValueA = std::to_string(weapon.damage);
        workshopValueB = std::to_string(weapon.ammunition);
        workshopValueC = std::to_string(weapon.useCost);
    } else if (workshopTab == 2 && !operative->shields.empty()) {
        workshopItem = std::clamp(workshopItem, 0,
                                  static_cast<int>(operative->shields.size()) - 1);
        const Shield& shield = operative->shields[static_cast<std::size_t>(workshopItem)];
        workshopItemName = shield.name;
        workshopItemId = std::to_string(shield.id);
        workshopValueA = std::to_string(shield.absorption);
        workshopValueB = std::to_string(shield.durability);
        workshopValueC = std::to_string(shield.weight);
    } else {
        workshopItemName.clear();
        workshopItemId.clear();
        workshopValueA.clear();
        workshopValueB.clear();
        workshopValueC.clear();
    }
}

void GameApp::Impl::openWorkshop() {
    if (!selected() || !engine.canUseWorkshop()) return;
    workshopTab = 0;
    workshopItem = 0;
    activeField = 0;
    deleteArmed = false;
    errorMessage.clear();
    syncWorkshopFields();
    modal = Modal::Workshop;
}

void GameApp::Impl::openPendingModal() {
    if (!engine.hasPendingDecision() || modal != Modal::None) return;
    const PendingDecision& decision = engine.pendingDecision();
    if (decision.type == DecisionType::Recruit) {
        resetRecruitForm();
        modal = Modal::Recruit;
    } else if (decision.type == DecisionType::TrojanTarget) {
        tacticalTarget = decision.candidates.empty() ? 0 : decision.candidates.front();
        tacticalPage = 0;
        modal = Modal::Trojan;
        errorMessage.clear();
    } else if (decision.type == DecisionType::Disruption) {
        tacticalTarget = decision.candidates.empty() ? 0 : decision.candidates.front();
        tacticalPage = 0;
        const auto free = engine.freeIds();
        disruptionDestination = free.empty() ? "1" : std::to_string(free.front());
        modal = Modal::Disruption;
        errorMessage.clear();
    }
}

void GameApp::Impl::consumeEvent(GameEvent event) {
    if (event.type == EventType::DecisionRequested) pendingModalDeferred = false;
    visibleEvents.push_back(event);
    const EffectFlavor flavor = effectFlavor(event);
    const bool visual = event.type == EventType::AttackStarted ||
                        event.type == EventType::DamageApplied ||
                        event.type == EventType::DamageAbsorbed ||
                        event.type == EventType::ShieldDamaged ||
                        event.type == EventType::ShieldBroken ||
                        event.type == EventType::ReactiveDamage ||
                        event.type == EventType::AttackEvaded ||
                        event.type == EventType::OperativeConverted ||
                        event.type == EventType::TrojanBlocked ||
                        event.type == EventType::DisruptionQueued ||
                        event.type == EventType::OperativeRelocated ||
                        event.type == EventType::NodeSplit ||
                        event.type == EventType::NodeBorrowed ||
                        event.type == EventType::NodesMerged ||
                        event.type == EventType::RootReduced ||
                        flavor == EffectFlavor::Malware;
    if (visual) {
        effects.push_back({event.type, flavor, event.sourceId, event.targetId, event.nodeId,
                           event.amount, 0.0F, effectsReduced ? 0.42F : 1.1F});
    }
    if (event.type == EventType::TurnStarted && turnStepping && event.turn > stepUntilTurn) {
        paused = true;
        turnStepping = false;
    }
    if (event.type == EventType::VictoryDeclared) {
        modal = Modal::None;
    }
    if (event.type == EventType::NodeSplit || event.type == EventType::NodesMerged ||
        event.type == EventType::RootReduced) {
        rebuildTreeLayout();
    }
}

void GameApp::Impl::advanceEngineUnit(const bool forceEventPop) {
    if (engine.hasQueuedEvents()) {
        consumeEvent(engine.popEvent());
        return;
    }
    if (engine.gameOver()) {
        screen = Screen::Victory;
        modal = Modal::None;
        cameraNeedsCenter = true;
        return;
    }
    if (engine.hasPendingDecision()) {
        if (config.mode == GameMode::AiVsAi) {
            std::string failure;
            if (!ai.resolve(engine, &failure)) {
                paused = true;
                errorMessage = "IA detenida: " + failure;
            } else if (!ai.lastExplanation().empty()) {
                // The engine remains the event authority; this explanation is only a UI annotation.
                errorMessage = ai.lastExplanation();
            }
        } else {
            openPendingModal();
        }
        if (forceEventPop && engine.hasQueuedEvents()) consumeEvent(engine.popEvent());
        return;
    }
    engine.pump();
    if (forceEventPop && engine.hasQueuedEvents()) consumeEvent(engine.popEvent());
}

void GameApp::Impl::continueAction() {
    if (config.mode == GameMode::Manual && engine.awaitingWorkshop() &&
        !engine.hasQueuedEvents()) {
        std::string failure;
        if (!engine.continueWorkshop(&failure)) errorMessage = failure;
        else errorMessage.clear();
        return;
    }
    advanceEngineUnit(true);
}

void GameApp::Impl::update(const float delta) {
    menuClock += delta;
    if (IsKeyPressed(KEY_F11)) {
        ToggleFullscreen();
        fullscreen = !fullscreen;
    }
    if (screen == Screen::Battle) updateBattle(delta);
    for (auto& effect : effects) effect.age += delta;
    std::erase_if(effects, [](const VisualEffect& effect) { return effect.age >= effect.duration; });
}

void GameApp::Impl::updateBattle(const float delta) {
    treeViewport = {8.0F, kHeaderHeight + 8.0F,
                    static_cast<float>(GetScreenWidth()) - kSideWidth - 20.0F,
                    static_cast<float>(GetScreenHeight()) - kHeaderHeight - kFooterHeight - 16.0F};
    camera.offset = {treeViewport.x + treeViewport.width * 0.5F,
                     treeViewport.y + treeViewport.height * 0.5F};
    rebuildTreeLayout();
    if (cameraNeedsCenter) centerCamera();
    if (modal == Modal::None) updateCamera(delta);

    if (IsKeyPressed(KEY_P) && modal == Modal::None) paused = !paused;
    if (IsKeyPressed(KEY_C) && modal == Modal::None) centerCamera();
    if (IsKeyPressed(KEY_I) && modal == Modal::None) showInspector = !showInspector;
    if (IsKeyPressed(KEY_H) && modal == Modal::None) modal = Modal::Help;
    if (IsKeyPressed(KEY_W) && modal == Modal::None && engine.canUseWorkshop() && selected() != nullptr) {
        openWorkshop();
    }

    bool eventSteppedThisFrame = false;
    if (modal == Modal::None && IsKeyPressed(KEY_E)) {
        advanceEngineUnit(true);
        eventSteppedThisFrame = true;
    }
    if (modal == Modal::None && IsKeyPressed(KEY_T) && config.mode == GameMode::AiVsAi) {
        stepUntilTurn = engine.snapshot().turn;
        turnStepping = true;
        paused = false;
    }
    if (modal == Modal::None && IsKeyPressed(KEY_SPACE)) {
        continueAction();
    }

    if (!paused && modal == Modal::None && !eventSteppedThisFrame) {
        eventClock += delta;
        const float interval = speedIndex == 4 ? 0.025F : 0.65F / speedValue(speedIndex);
        int guard = speedIndex == 4 ? 8 : 1;
        while (eventClock >= interval && guard-- > 0 && modal == Modal::None && !paused) {
            eventClock -= interval;
            advanceEngineUnit(false);
        }
    }
    if (config.mode == GameMode::Manual && engine.hasPendingDecision() &&
        !engine.hasQueuedEvents() && modal == Modal::None && !pendingModalDeferred) {
        openPendingModal();
    }
    if (engine.gameOver() && !engine.hasQueuedEvents() && modal == Modal::None) {
        screen = Screen::Victory;
        cameraNeedsCenter = true;
    }
}

void GameApp::Impl::rebuildTreeLayout() {
    nodeVisuals.clear();
    operativePositions.clear();
    nodePositions.clear();
    const TreeSnapshot tree = engine.snapshot().tree;
    if (!tree.rootId) {
        treeCenter = {0.0F, 0.0F};
        treeExtents = {500.0F, 300.0F};
        return;
    }
    std::unordered_map<BTree::NodeId, const NodeSnapshot*> lookup;
    for (const NodeSnapshot& node : tree.nodes) lookup[node.id] = &node;
    float leaf = 0.0F;
    std::unordered_map<BTree::NodeId, Vector2> raw;
    std::function<float(BTree::NodeId, int)> place = [&](const BTree::NodeId id, const int depth) {
        const auto found = lookup.find(id);
        if (found == lookup.end()) return leaf * kNodeGapX;
        const NodeSnapshot& node = *found->second;
        float x = 0.0F;
        if (node.children.empty()) {
            x = leaf * kNodeGapX;
            leaf += 1.0F;
        } else {
            std::vector<float> children;
            children.reserve(node.children.size());
            for (const BTree::NodeId child : node.children) children.push_back(place(child, depth + 1));
            x = (children.front() + children.back()) * 0.5F;
        }
        raw[id] = {x, static_cast<float>(depth) * kNodeGapY};
        return x;
    };
    place(*tree.rootId, 0);

    float minX = std::numeric_limits<float>::max();
    float maxX = std::numeric_limits<float>::lowest();
    float maxY = 0.0F;
    for (const auto& [id, point] : raw) {
        static_cast<void>(id);
        minX = std::min(minX, point.x);
        maxX = std::max(maxX, point.x);
        maxY = std::max(maxY, point.y);
    }
    const float shift = (minX + maxX) * 0.5F;
    for (const NodeSnapshot& node : tree.nodes) {
        const Vector2 point{raw[node.id].x - shift, raw[node.id].y};
        NodeVisual visual;
        visual.id = node.id;
        visual.center = point;
        visual.bounds = {point.x - kNodeWidth * 0.5F, point.y - kNodeHeight * 0.5F,
                         kNodeWidth, kNodeHeight};
        for (int slot = 0; slot < 3; ++slot) {
            visual.slots[static_cast<std::size_t>(slot)] =
                {visual.bounds.x + 7.0F + static_cast<float>(slot) * 94.0F,
                 visual.bounds.y + 22.0F, 90.0F, 77.0F};
        }
        nodeVisuals.push_back(visual);
        nodePositions[node.id] = point;
        for (std::size_t index = 0; index < node.operatives.size() && index < 3; ++index) {
            const Rectangle slot = visual.slots[index];
            operativePositions[node.operatives[index].id] =
                {slot.x + slot.width * 0.5F, slot.y + slot.height * 0.5F};
        }
    }
    treeCenter = {0.0F, maxY * 0.5F};
    treeExtents = {std::max(420.0F, maxX - minX + kNodeWidth + 80.0F),
                   std::max(260.0F, maxY + kNodeHeight + 80.0F)};
}

void GameApp::Impl::centerCamera() {
    rebuildTreeLayout();
    camera.target = treeCenter;
    const float availableX = std::max(100.0F, treeViewport.width - 40.0F);
    const float availableY = std::max(100.0F, treeViewport.height - 40.0F);
    camera.zoom = std::clamp(std::min(availableX / treeExtents.x, availableY / treeExtents.y),
                             0.28F, 1.35F);
    cameraNeedsCenter = false;
}

void GameApp::Impl::updateCamera(const float delta) {
    const Vector2 mouse = GetMousePosition();
    if (CheckCollisionPointRec(mouse, treeViewport)) {
        const float wheel = GetMouseWheelMove();
        if (wheel != 0.0F) {
            const Vector2 before = GetScreenToWorld2D(mouse, camera);
            camera.zoom = std::clamp(camera.zoom * (1.0F + wheel * 0.12F), 0.22F, 2.3F);
            const Vector2 after = GetScreenToWorld2D(mouse, camera);
            camera.target.x += before.x - after.x;
            camera.target.y += before.y - after.y;
        }
        if (IsMouseButtonDown(MOUSE_BUTTON_MIDDLE) || IsMouseButtonDown(MOUSE_BUTTON_RIGHT)) {
            const Vector2 movement = GetMouseDelta();
            camera.target.x -= movement.x / camera.zoom;
            camera.target.y -= movement.y / camera.zoom;
        }
    }
    const float movement = 420.0F * delta / camera.zoom;
    if (IsKeyDown(KEY_A) || IsKeyDown(KEY_LEFT)) camera.target.x -= movement;
    if (IsKeyDown(KEY_D) || IsKeyDown(KEY_RIGHT)) camera.target.x += movement;
    if (IsKeyDown(KEY_W) || IsKeyDown(KEY_UP)) camera.target.y -= movement;
    if (IsKeyDown(KEY_S) || IsKeyDown(KEY_DOWN)) camera.target.y += movement;
    if (IsKeyPressed(KEY_EQUAL) || IsKeyPressed(KEY_KP_ADD)) camera.zoom = std::min(2.3F, camera.zoom * 1.15F);
    if (IsKeyPressed(KEY_MINUS) || IsKeyPressed(KEY_KP_SUBTRACT)) camera.zoom = std::max(0.22F, camera.zoom / 1.15F);
}

const Operative* GameApp::Impl::selected() const {
    return selectedOperative == 0 ? nullptr : engine.tree().find(selectedOperative);
}

void GameApp::Impl::draw() {
    ClearBackground(kVoid);
    switch (screen) {
    case Screen::MainMenu: drawMainMenu(); break;
    case Screen::Setup: drawSetup(); break;
    case Screen::Battle: drawBattle(); break;
    case Screen::HowTo: drawHowTo(); break;
    case Screen::Arsenal: drawArsenal(); break;
    case Screen::Settings: drawSettings(); break;
    case Screen::Victory: drawVictory(); break;
    }
}

void GameApp::Impl::drawBackground(const float intensity) const {
    const int width = GetScreenWidth();
    const int height = GetScreenHeight();
    DrawRectangleGradientV(0, 0, width, height, Color{4, 7, 22, 255}, Color{10, 5, 28, 255});
    const float drift = std::sin(menuClock * 0.08F) * 42.0F;
    DrawCircleGradient(Vector2{width * 0.18F + drift, height * 0.35F}, height * 0.32F,
                       withAlpha(kMagenta, static_cast<unsigned char>(24 * intensity)),
                       Color{15, 2, 34, 0});
    DrawCircleGradient(Vector2{width * 0.78F - drift * 0.6F, height * 0.60F}, height * 0.39F,
                       withAlpha(kCyan, static_cast<unsigned char>(18 * intensity)),
                       Color{1, 10, 30, 0});

    for (const Star& star : stars) {
        float x = star.x * static_cast<float>(width) + menuClock * (4.0F + star.depth * 10.0F);
        x = std::fmod(x, static_cast<float>(width) + 20.0F) - 10.0F;
        const float y = star.y * static_cast<float>(height);
        const float pulse = 0.55F + 0.45F * std::sin(menuClock * (1.1F + star.depth) + star.x * 19.0F);
        Color color = star.color;
        color.a = static_cast<unsigned char>(45.0F + 135.0F * star.depth * pulse * intensity);
        const int size = static_cast<int>(std::max(1.0F, star.size * star.depth));
        DrawRectangle(static_cast<int>(x), static_cast<int>(y), size, size, color);
    }

    // A slow parallax asteroid belt crosses behind the interface.
    for (int asteroid = 0; asteroid < 24; ++asteroid) {
        const float depth = 0.25F + static_cast<float>((asteroid * 37) % 60) / 100.0F;
        float x = static_cast<float>((asteroid * 173) % std::max(1, width)) +
                  menuClock * (2.0F + depth * 4.0F);
        x = std::fmod(x, static_cast<float>(width) + 60.0F) - 30.0F;
        const float y = height * 0.18F + x * 0.22F +
                        std::sin(static_cast<float>(asteroid) * 2.7F) * 42.0F;
        const float radius = 3.0F + static_cast<float>((asteroid * 11) % 8);
        const Color rock{93, 83, 118,
                         static_cast<unsigned char>((30.0F + depth * 55.0F) * intensity)};
        DrawPoly({x, y}, 6 + asteroid % 3, radius, static_cast<float>(asteroid * 23), rock);
        DrawCircleV({x - radius * 0.22F, y - radius * 0.18F},
                    std::max(1.0F, radius * 0.18F), withAlpha(kMagenta, rock.a / 2));
    }

    // Bioluminescent alien growth silhouettes anchor the lowest parallax layer.
    for (int growth = 0; growth < 18; ++growth) {
        const float sideX = growth < 9 ? width * (0.015F + growth * 0.018F)
                                      : width * (0.985F - (growth - 9) * 0.018F);
        const float stalk = 24.0F + static_cast<float>((growth * 17) % 54);
        const float sway = std::sin(menuClock * 0.35F + growth) * 4.0F;
        const Color glow = growth % 2 == 0 ? withAlpha(kCyan, static_cast<unsigned char>(42 * intensity))
                                           : withAlpha(kMagenta, static_cast<unsigned char>(42 * intensity));
        DrawLineEx({sideX, static_cast<float>(height)},
                   {sideX + sway, static_cast<float>(height) - stalk}, 2.0F, glow);
        DrawCircleV({sideX + sway, static_cast<float>(height) - stalk}, 3.0F, glow);
        DrawLineEx({sideX + sway * 0.4F, static_cast<float>(height) - stalk * 0.45F},
                   {sideX + sway + (growth < 9 ? 9.0F : -9.0F),
                    static_cast<float>(height) - stalk * 0.68F}, 1.0F, glow);
    }

    // Original cosmic Yggdrasil roots: procedural circuit branches, not an external asset.
    const Vector2 root{static_cast<float>(width) * 0.5F, static_cast<float>(height) * 1.02F};
    for (int branch = 0; branch < 11; ++branch) {
        const float side = branch < 5 ? -1.0F : branch > 5 ? 1.0F : 0.0F;
        const float spread = static_cast<float>(std::abs(branch - 5));
        const Vector2 mid{root.x + side * (55.0F + spread * 38.0F),
                          root.y - 190.0F - spread * 24.0F};
        const Vector2 end{root.x + side * (110.0F + spread * 105.0F),
                          root.y - 320.0F - spread * 42.0F};
        const Color rootColor = branch % 2 == 0 ? withAlpha(kCyan, 38) : withAlpha(kMagenta, 38);
        DrawLineEx(root, mid, 2.0F + (5.0F - std::min(5.0F, spread)) * 0.25F, rootColor);
        DrawLineEx(mid, end, 1.0F, rootColor);
        DrawCircleV(end, 3.0F, rootColor);
    }
    for (int index = 0; index < 7; ++index) {
        const float y = height * (0.14F + 0.11F * static_cast<float>(index));
        const float x = width * (0.82F + 0.025F * std::sin(index * 2.1F));
        DrawRectangleLinesEx({x, y, 70.0F + index * 8.0F, 13.0F}, 1.0F,
                             Color{94, 68, 125, 32});
    }
}

void GameApp::Impl::drawMainMenu() {
    drawBackground(1.0F);
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    const Rectangle title{width * 0.08F, 72.0F, width * 0.84F, 122.0F};
    centered("OPERACION YGGDRASIL", title, std::clamp(static_cast<int>(width / 31.0F), 34, 58), kText);
    centered("ARBOL B-4 // GUERRA DE NEXOS", {title.x, title.y + 80.0F, title.width, 32.0F},
             18, kCyan);
    DrawLineEx({width * 0.22F, 190.0F}, {width * 0.78F, 190.0F}, 2.0F,
               Color{35, 235, 246, 90});

    const float menuWidth = std::min(440.0F, width * 0.44F);
    const float x = (width - menuWidth) * 0.5F;
    const float startY = std::max(230.0F, height * 0.27F);
    const float gap = 57.0F;
    if (button({x, startY, menuWidth, 46.0F}, "JUGAR MANUAL", engine.catalogsReady(), kCyan, 20)) {
        config.mode = GameMode::Manual;
        screen = Screen::Setup;
        rulesConfirmed = false;
    }
    if (button({x, startY + gap, menuWidth, 46.0F}, "IA VS IA", engine.catalogsReady(), kMagenta, 20)) {
        config.mode = GameMode::AiVsAi;
        screen = Screen::Setup;
        rulesConfirmed = false;
    }
    if (button({x, startY + gap * 2.0F, menuWidth, 46.0F}, "COMO JUGAR", true, kAmber, 18)) {
        returnScreen = Screen::MainMenu;
        screen = Screen::HowTo;
    }
    if (button({x, startY + gap * 3.0F, menuWidth, 46.0F}, "ARSENAL Y MECANICAS", true, kMagenta, 18)) {
        screen = Screen::Arsenal;
        arsenalScroll = 0.0F;
    }
    if (button({x, startY + gap * 4.0F, menuWidth, 46.0F}, "CONFIGURACION", true, kCyan, 18)) {
        returnScreen = Screen::MainMenu;
        screen = Screen::Settings;
    }
    if (button({x, startY + gap * 5.0F, menuWidth, 46.0F}, "SALIR", true, kRed, 18)) running = false;

    if (!engine.catalogsReady()) {
        const Rectangle warning{x - 120.0F, startY + gap * 6.0F, menuWidth + 240.0F, 70.0F};
        panel(warning, kRed);
        wrapped(errorMessage, {warning.x + 14.0F, warning.y + 12.0F, warning.width - 28.0F, 50.0F},
                15, kRed);
    }
    label("F11 PANTALLA COMPLETA", {18.0F, height - 28.0F}, 14, kMuted);
    label("MOTOR DETERMINISTA + RAYLIB", {width - 290.0F, height - 28.0F}, 14, kMuted);
}

void GameApp::Impl::drawSetup() {
    drawBackground(0.72F);
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    centered("CONFIGURACION DE MISION", {0.0F, 35.0F, width, 58.0F}, 32, kText);
    const Rectangle card{(width - 720.0F) * 0.5F, 112.0F, 720.0F,
                         std::min(670.0F, height - 155.0F)};
    panel(card, config.mode == GameMode::Manual ? kCyan : kMagenta, 244);
    float y = card.y + 35.0F;
    label("MODO", {card.x + 34.0F, y + 12.0F}, 16, kMuted);
    const Color modeColor = config.mode == GameMode::Manual ? kCyan : kMagenta;
    centered(gameModeName(config.mode), {card.x + 230.0F, y, 450.0F, 42.0F}, 20, modeColor);
    y += 64.0F;

    label("TURNOS PARES (2-60)", {card.x + 34.0F, y + 12.0F}, 16, kMuted);
    textField({card.x + 480.0F, y, 120.0F, 42.0F}, turnText, 101, true, 2, "10");
    int turns = 10;
    parseInteger(turnText, turns);
    if (button({card.x + 610.0F, y, 34.0F, 42.0F}, "+", true, modeColor, 20)) {
        turns = std::min(60, turns + (turns % 2 == 0 ? 2 : 1));
        turnText = std::to_string(turns);
    }
    if (button({card.x + 436.0F, y, 34.0F, 42.0F}, "-", true, modeColor, 20)) {
        turns = std::max(2, turns - (turns % 2 == 0 ? 2 : 1));
        turnText = std::to_string(turns);
    }
    y += 64.0F;

    label("SEMILLA REPRODUCIBLE", {card.x + 34.0F, y + 12.0F}, 16, kMuted);
    if (textField({card.x + 310.0F, y, 246.0F, 42.0F}, seedText, 102, true, 20, "0")) {
        seedCopied = false;
    }
    if (button({card.x + 566.0F, y, 78.0F, 42.0F}, seedCopied ? "OK" : "COPIAR",
               !seedText.empty(), seedCopied ? kGreen : modeColor, 12)) {
        SetClipboardText(seedText.c_str());
        seedCopied = true;
    }
    y += 64.0F;
    label("VELOCIDAD VISUAL", {card.x + 34.0F, y + 12.0F}, 16, kMuted);
    if (button({card.x + 430.0F, y, 214.0F, 42.0F}, speedLabel(speedIndex), true, modeColor, 18)) {
        speedIndex = (speedIndex + 1) % 5;
    }
    y += 64.0F;
    label("EFECTOS REDUCIDOS", {card.x + 34.0F, y + 12.0F}, 16, kMuted);
    if (button({card.x + 430.0F, y, 214.0F, 42.0F}, effectsReduced ? "ACTIVADOS" : "COMPLETOS",
               true, effectsReduced ? kGreen : modeColor, 17)) effectsReduced = !effectsReduced;
    y += 67.0F;

    const Rectangle rules{card.x + 30.0F, y, card.width - 60.0F, 110.0F};
    panel(rules, rulesConfirmed ? kGreen : kAmber, 215);
    wrapped("Confirmo las reglas: IDs unicos forman el Arbol B-4 real; escudos son pila LIFO; "
            "armas son cola FIFO; iniciativa usa rapidez; heroes y victoria siguen el motor canonico.",
            {rules.x + 54.0F, rules.y + 14.0F, rules.width - 70.0F, 80.0F}, 15, kText);
    const Rectangle check{rules.x + 15.0F, rules.y + 38.0F, 25.0F, 25.0F};
    DrawRectangleLinesEx(check, 2.0F, rulesConfirmed ? kGreen : kAmber);
    if (rulesConfirmed) {
        DrawLineEx({check.x + 5.0F, check.y + 13.0F}, {check.x + 11.0F, check.y + 20.0F}, 3.0F, kGreen);
        DrawLineEx({check.x + 11.0F, check.y + 20.0F}, {check.x + 22.0F, check.y + 5.0F}, 3.0F, kGreen);
    }
    if (CheckCollisionPointRec(GetMousePosition(), rules) && IsMouseButtonReleased(MOUSE_BUTTON_LEFT)) {
        rulesConfirmed = !rulesConfirmed;
    }
    y += 130.0F;
    if (button({card.x + 366.0F, y, 278.0F, 48.0F}, "INICIAR OPERACION",
               rulesConfirmed && engine.catalogsReady(), modeColor, 19)) beginGame(config.mode);
    if (button({card.x + 30.0F, y, 150.0F, 48.0F}, "VOLVER", true, kMuted, 17)) screen = Screen::MainMenu;
}

void GameApp::Impl::drawHowTo() {
    drawBackground(0.55F);
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    centered("COMO JUGAR", {0.0F, 24.0F, width, 56.0F}, 34, kText);
    const float margin = 34.0F;
    const float gap = 14.0F;
    const float cardWidth = (width - margin * 2.0F - gap * 2.0F) / 3.0F;
    const float cardHeight = (height - 158.0F - gap) / 2.0F;
    struct Topic { const char* title; const char* body; Color color; };
    const std::array<Topic, 6> topics{{
        {"ARBOL B-4", "Cada estacion es un nodo real con 1-3 claves. El ID ordena al operativo. Split, borrow, merge y reduccion de raiz cambian la topologia visible.", kCyan},
        {"RECLUTAMIENTO", "El dado concede inserciones. Usa catalogo, clase rapida o creacion personalizada. Un ID ocupado nunca es legal; los heroes tienen turnos propios.", kMagenta},
        {"INICIATIVA", "En nodos en conflicto ataca primero quien tenga mayor rapidez; el ID menor resuelve empates. El motor escoge solo objetivos validos.", kAmber},
        {"EQUIPO", "Escudos: pila LIFO, el ultimo agregado absorbe primero. Arsenal: cola FIFO, el arma del frente se consume antes de pasar a la siguiente.", kGreen},
        {"HEROES", "Troyano convierte un enemigo salvo Cortafuegos Cuantico. Disrupcion retira y reinserta una clave con ID nuevo durante la limpieza.", kMagenta},
        {"VICTORIA", "Gana por aniquilacion, dominio sostenido de la raiz o conteo final al alcanzar el limite de turnos/inserciones. La semilla reproduce la guerra.", kCyan},
    }};
    for (int index = 0; index < 6; ++index) {
        const int column = index % 3;
        const int row = index / 3;
        const Rectangle card{margin + column * (cardWidth + gap), 96.0F + row * (cardHeight + gap),
                             cardWidth, cardHeight};
        panel(card, topics[static_cast<std::size_t>(index)].color);
        label(topics[static_cast<std::size_t>(index)].title, {card.x + 18.0F, card.y + 18.0F}, 19,
              topics[static_cast<std::size_t>(index)].color);
        wrapped(topics[static_cast<std::size_t>(index)].body,
                {card.x + 18.0F, card.y + 56.0F, card.width - 36.0F, card.height - 70.0F}, 16, kText, 6.0F);
        const float iconX = card.x + card.width - 36.0F;
        DrawCircleLines(static_cast<int>(iconX), static_cast<int>(card.y + 28.0F), 11.0F,
                        topics[static_cast<std::size_t>(index)].color);
        centered(std::to_string(index + 1), {iconX - 11.0F, card.y + 17.0F, 22.0F, 22.0F},
                 13, topics[static_cast<std::size_t>(index)].color);
    }
    if (button({margin, height - 52.0F, 156.0F, 38.0F}, "VOLVER [ESC]", true, kMuted, 15) ||
        IsKeyPressed(KEY_ESCAPE)) screen = returnScreen;
}

void GameApp::Impl::drawArsenal() {
    drawBackground(0.44F);
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    centered("ARSENAL Y MECANICAS", {0.0F, 20.0F, width, 55.0F}, 32, kText);
    const Rectangle content{28.0F, 88.0F, width - 56.0F, height - 152.0F};
    panel(content, kMagenta);
    BeginScissorMode(static_cast<int>(content.x + 2.0F), static_cast<int>(content.y + 2.0F),
                     static_cast<int>(content.width - 4.0F), static_cast<int>(content.height - 4.0F));
    const Vector2 mouse = GetMousePosition();
    if (CheckCollisionPointRec(mouse, content)) arsenalScroll += GetMouseWheelMove() * 34.0F;
    const auto& weapons = engine.catalogs().weapons();
    const auto& shields = engine.catalogs().shields();
    const float totalRows = static_cast<float>(std::max(weapons.size(), shields.size()));
    const float totalHeight = 70.0F + totalRows * 88.0F + 170.0F;
    arsenalScroll = std::clamp(arsenalScroll, std::min(0.0F, content.height - totalHeight), 0.0F);
    float y = content.y + 24.0F + arsenalScroll;
    const float columnWidth = (content.width - 54.0F) * 0.5F;
    label("COLA FIFO DE ARMAS", {content.x + 18.0F, y}, 20, kCyan);
    label("PILA LIFO DE ESCUDOS", {content.x + 36.0F + columnWidth, y}, 20, kMagenta);
    y += 42.0F;
    const std::size_t rows = std::max(weapons.size(), shields.size());
    for (std::size_t index = 0; index < rows; ++index) {
        if (index < weapons.size()) {
            const auto& weapon = weapons[index];
            const Rectangle item{content.x + 18.0F, y, columnWidth, 74.0F};
            panel(item, kCyanSoft, 210);
            label(ellipsis(weapon.name, 34), {item.x + 12.0F, item.y + 10.0F}, 16, kText);
            label("DMG " + std::to_string(weapon.damage) + "  MUN " + std::to_string(weapon.ammunition) +
                      "  COSTE " + std::to_string(weapon.use_cost),
                  {item.x + 12.0F, item.y + 39.0F}, 14, kCyan);
        }
        if (index < shields.size()) {
            const auto& shield = shields[index];
            const Rectangle item{content.x + 36.0F + columnWidth, y, columnWidth, 74.0F};
            panel(item, kMagentaSoft, 210);
            label(ellipsis(shield.name, 34), {item.x + 12.0F, item.y + 10.0F}, 16, kText);
            label("ABS " + std::to_string(shield.absorption) + "  DUR " + std::to_string(shield.durability) +
                      "  PESO " + std::to_string(shield.weight),
                  {item.x + 12.0F, item.y + 39.0F}, 14, kMagenta);
        }
        y += 88.0F;
    }
    const Rectangle mechanics{content.x + 18.0F, y + 10.0F, content.width - 36.0F, 130.0F};
    panel(mechanics, kAmber, 220);
    label("LECTURA TACTICA", {mechanics.x + 16.0F, mechanics.y + 14.0F}, 18, kAmber);
    wrapped("Plasma y Gauss priorizan dano; Espada de Iones castiga la barrera cinetica; EMP impacta el nodo; "
            "Malware reduce rapidez. Deflector protege el nodo, Blindaje Reactivo devuelve dano, Cortafuegos "
            "bloquea Troyano y Camuflaje evade parte del impacto. Todas las cifras vienen de data/.",
            {mechanics.x + 16.0F, mechanics.y + 47.0F, mechanics.width - 32.0F, 72.0F}, 15, kText, 5.0F);
    EndScissorMode();
    label("RUEDA: DESPLAZAR", {width - 220.0F, height - 48.0F}, 14, kMuted);
    if (button({28.0F, height - 56.0F, 160.0F, 40.0F}, "VOLVER [ESC]", true, kMuted, 15) ||
        IsKeyPressed(KEY_ESCAPE)) screen = Screen::MainMenu;
}

void GameApp::Impl::drawSettings() {
    drawBackground(0.62F);
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    centered("CONFIGURACION", {0.0F, 40.0F, width, 55.0F}, 34, kText);
    const Rectangle card{(width - 600.0F) * 0.5F, 130.0F, 600.0F, 420.0F};
    panel(card, kCyan);
    label("VELOCIDAD VISUAL PREDETERMINADA", {card.x + 30.0F, card.y + 50.0F}, 17, kMuted);
    if (button({card.x + 365.0F, card.y + 36.0F, 190.0F, 44.0F}, speedLabel(speedIndex), true, kCyan, 17)) {
        speedIndex = (speedIndex + 1) % 5;
    }
    label("DURACION DE EFECTOS", {card.x + 30.0F, card.y + 127.0F}, 17, kMuted);
    if (button({card.x + 365.0F, card.y + 112.0F, 190.0F, 44.0F},
               effectsReduced ? "REDUCIDA" : "COMPLETA", true, kMagenta, 17)) effectsReduced = !effectsReduced;
    label("MODO DE VENTANA", {card.x + 30.0F, card.y + 204.0F}, 17, kMuted);
    if (button({card.x + 365.0F, card.y + 189.0F, 190.0F, 44.0F},
               fullscreen ? "PANTALLA COMPLETA" : "VENTANA", true, kAmber, 15)) {
        ToggleFullscreen();
        fullscreen = !fullscreen;
    }
    const Rectangle note{card.x + 28.0F, card.y + 270.0F, card.width - 56.0F, 105.0F};
    panel(note, kLine, 210);
    wrapped("Atajos globales: F11 alterna pantalla completa. En batalla, rueda hace zoom, boton medio/derecho "
            "desplaza la camara y C centra el Arbol. La aplicacion no reproduce audio.",
            {note.x + 14.0F, note.y + 15.0F, note.width - 28.0F, 75.0F}, 15, kText, 5.0F);
    if (button({(width - 180.0F) * 0.5F, std::min(height - 70.0F, card.y + card.height + 26.0F),
                180.0F, 44.0F}, "GUARDAR Y VOLVER", true, kGreen, 16) || IsKeyPressed(KEY_ESCAPE)) {
        screen = returnScreen;
    }
}

void GameApp::Impl::drawBattle() {
    drawBackground(0.34F);
    const GameSnapshot snapshot = engine.snapshot();
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    treeViewport = {8.0F, kHeaderHeight + 8.0F,
                    width - kSideWidth - 20.0F,
                    height - kHeaderHeight - kFooterHeight - 16.0F};
    camera.offset = {treeViewport.x + treeViewport.width * 0.5F,
                     treeViewport.y + treeViewport.height * 0.5F};

    drawBattleHeader(snapshot);
    DrawRectangleRec(treeViewport, Color{3, 8, 24, 118});
    DrawRectangleLinesEx(treeViewport, 1.0F, Color{35, 235, 246, 55});
    drawTree(modal == Modal::None);
    drawInspector(snapshot);
    drawEventLog();
    drawBattleFooter();

    if (!errorMessage.empty() && modal == Modal::None) {
        const Rectangle toast{treeViewport.x + 18.0F, treeViewport.y + 16.0F,
                              std::min(570.0F, treeViewport.width - 36.0F), 58.0F};
        panel(toast, errorMessage.rfind("IA detenida", 0) == 0 ? kRed : kAmber, 235);
        wrapped(errorMessage, {toast.x + 12.0F, toast.y + 9.0F, toast.width - 24.0F, 44.0F},
                14, kText, 3.0F);
    }

    switch (modal) {
    case Modal::Recruit: drawRecruitModal(); break;
    case Modal::Trojan: drawTacticalModal(false); break;
    case Modal::Disruption: drawTacticalModal(true); break;
    case Modal::Workshop: drawWorkshopModal(); break;
    case Modal::Help: drawHelpModal(); break;
    case Modal::None: break;
    }
}

void GameApp::Impl::drawBattleHeader(const GameSnapshot& snapshot) {
    const float width = static_cast<float>(GetScreenWidth());
    DrawRectangle(0, 0, GetScreenWidth(), static_cast<int>(kHeaderHeight), Color{5, 10, 28, 248});
    DrawLine(0, static_cast<int>(kHeaderHeight - 1.0F), GetScreenWidth(),
             static_cast<int>(kHeaderHeight - 1.0F), factionColor(snapshot.activeFaction));
    label("YGGDRASIL", {16.0F, 12.0F}, 24, kText);
    label("B-4 WARGRID", {17.0F, 43.0F}, 12, kCyan);

    const float start = 184.0F;
    const float usable = width - start - 14.0F;
    const float column = usable / 6.0F;
    struct Stat { const char* name; std::string value; Color color; };
    const std::array<Stat, 6> stats{{
        {"TURNO", std::to_string(snapshot.turn) + "/" + std::to_string(snapshot.maxTurns), kText},
        {"BANDO", std::string(factionName(snapshot.activeFaction)), factionColor(snapshot.activeFaction)},
        {"FASE", std::string(phaseName(snapshot.phase)), kAmber},
        {"INSERCIONES", std::to_string(snapshot.totalInsertions) + "  (" +
                         std::to_string(snapshot.remainingInsertions) + " disp.)", kText},
        {"SEMILLA", std::to_string(snapshot.seed), kMuted},
        {"VELOCIDAD", speedLabel(speedIndex), paused ? kAmber : kGreen},
    }};
    for (int index = 0; index < 6; ++index) {
        const float x = start + column * static_cast<float>(index);
        label(stats[static_cast<std::size_t>(index)].name, {x, 10.0F}, 11, kMuted);
        label(ellipsis(stats[static_cast<std::size_t>(index)].value,
                       static_cast<std::size_t>(std::max(5.0F, column / 9.0F))),
              {x, 35.0F}, 16, stats[static_cast<std::size_t>(index)].color);
        if (index > 0) DrawLine(static_cast<int>(x - 9.0F), 10, static_cast<int>(x - 9.0F), 66, kLine);
    }
}

void GameApp::Impl::drawTree(const bool interactive) {
    const TreeSnapshot tree = engine.snapshot().tree;
    if (!tree.rootId) {
        centered("LA RED YGGDRASIL ESPERA SU PRIMER OPERATIVO",
                 treeViewport, 18, withAlpha(kMuted, 180));
        centered("El dado y la faccion activa aparecen en el encabezado",
                 {treeViewport.x, treeViewport.y + 48.0F, treeViewport.width, treeViewport.height},
                 14, withAlpha(kMuted, 130));
        return;
    }
    std::unordered_map<BTree::NodeId, const NodeSnapshot*> lookup;
    for (const NodeSnapshot& node : tree.nodes) lookup[node.id] = &node;

    BeginScissorMode(static_cast<int>(treeViewport.x), static_cast<int>(treeViewport.y),
                     static_cast<int>(treeViewport.width), static_cast<int>(treeViewport.height));
    BeginMode2D(camera);
    for (const NodeSnapshot& parent : tree.nodes) {
        const auto parentPosition = nodePositions.find(parent.id);
        if (parentPosition == nodePositions.end()) continue;
        for (std::size_t childIndex = 0; childIndex < parent.children.size(); ++childIndex) {
            const auto childPosition = nodePositions.find(parent.children[childIndex]);
            if (childPosition == nodePositions.end()) continue;
            const Vector2 start{parentPosition->second.x,
                                parentPosition->second.y + kNodeHeight * 0.5F};
            const Vector2 end{childPosition->second.x,
                              childPosition->second.y - kNodeHeight * 0.5F};
            const Vector2 elbowA{start.x, start.y + (end.y - start.y) * 0.44F};
            const Vector2 elbowB{end.x, elbowA.y};
            const Color branch = childIndex % 2 == 0 ? withAlpha(kCyan, 112) : withAlpha(kMagenta, 112);
            DrawLineEx(start, elbowA, 4.0F, withAlpha(branch, 36));
            DrawLineEx(elbowA, elbowB, 4.0F, withAlpha(branch, 36));
            DrawLineEx(elbowB, end, 4.0F, withAlpha(branch, 36));
            DrawLineEx(start, elbowA, 1.2F, branch);
            DrawLineEx(elbowA, elbowB, 1.2F, branch);
            DrawLineEx(elbowB, end, 1.2F, branch);
            DrawCircleV(elbowB, 3.0F, branch);
        }
    }
    for (const NodeSnapshot& node : tree.nodes) {
        const auto found = std::find_if(nodeVisuals.begin(), nodeVisuals.end(),
                                        [&](const NodeVisual& visual) { return visual.id == node.id; });
        if (found != nodeVisuals.end()) drawNode(node, *found, interactive);
    }
    drawEffects();
    EndMode2D();
    EndScissorMode();

    const Rectangle zoomBadge{treeViewport.x + 12.0F, treeViewport.y + treeViewport.height - 33.0F,
                              176.0F, 24.0F};
    DrawRectangleRounded(zoomBadge, 0.2F, 4, Color{5, 12, 27, 205});
    centered("ZOOM " + std::to_string(static_cast<int>(camera.zoom * 100.0F)) + "%  |  RUEDA",
             zoomBadge, 12, kMuted);
}

void GameApp::Impl::drawNode(const NodeSnapshot& snapshot, const NodeVisual& visual,
                             const bool interactive) {
    const bool nodeSelected = selectedNode == snapshot.id;
    const Color edge = nodeSelected ? kAmber : (snapshot.id == engine.snapshot().tree.rootId.value_or(0)
                                                   ? kCyan : kLine);
    DrawRectangleRounded(visual.bounds, 0.13F, 8, Color{7, 15, 34, 245});
    DrawRectangleRoundedLinesEx(visual.bounds, 0.13F, 8, nodeSelected ? 3.0F : 1.5F, edge);
    DrawRectangle(static_cast<int>(visual.bounds.x + 8.0F), static_cast<int>(visual.bounds.y + 5.0F),
                  static_cast<int>(visual.bounds.width - 16.0F), 10, Color{16, 39, 62, 255});
    label("NEXO " + std::to_string(snapshot.id), {visual.bounds.x + 10.0F, visual.bounds.y + 5.0F},
          10, snapshot.id == engine.snapshot().tree.rootId.value_or(0) ? kCyan : kMuted);
    for (int index = 0; index < 3; ++index) {
        const Rectangle slot = visual.slots[static_cast<std::size_t>(index)];
        if (index < static_cast<int>(snapshot.operatives.size())) {
            drawOperative(snapshot.operatives[static_cast<std::size_t>(index)], slot,
                          selectedOperative == snapshot.operatives[static_cast<std::size_t>(index)].id);
        } else {
            DrawRectangleRounded(slot, 0.08F, 4, Color{5, 11, 25, 180});
            DrawRectangleRoundedLinesEx(slot, 0.08F, 4, 1.0F, Color{33, 54, 75, 130});
            centered("VACIO", slot, 10, Color{54, 75, 92, 150});
        }
    }

    if (interactive && IsMouseButtonReleased(MOUSE_BUTTON_LEFT) &&
        CheckCollisionPointRec(GetMousePosition(), treeViewport)) {
        const Vector2 world = GetScreenToWorld2D(GetMousePosition(), camera);
        bool operativeHit = false;
        for (std::size_t index = 0; index < snapshot.operatives.size() && index < 3; ++index) {
            if (CheckCollisionPointRec(world, visual.slots[index])) {
                selectedOperative = snapshot.operatives[index].id;
                selectedNode = snapshot.id;
                showInspector = true;
                operativeHit = true;
                break;
            }
        }
        if (!operativeHit && CheckCollisionPointRec(world, visual.bounds)) {
            selectedOperative = 0;
            selectedNode = snapshot.id;
            showInspector = true;
        }
    }
}

void GameApp::Impl::drawOperative(const Operative& operative, const Rectangle slot,
                                  const bool isSelected) const {
    const Color color = factionColor(operative.faction);
    DrawRectangleRounded(slot, 0.08F, 4, withAlpha(color, isSelected ? 62 : 24));
    DrawRectangleRoundedLinesEx(slot, 0.08F, 4, isSelected ? 2.4F : 1.0F,
                                isSelected ? kAmber : withAlpha(color, 190));
    const Vector2 marker{slot.x + 13.0F, slot.y + 16.0F};
    if (operative.faction == Faction::Neon) {
        const std::array<Vector2, 4> diamond{{{marker.x, marker.y - 8.0F}, {marker.x + 8.0F, marker.y},
                                             {marker.x, marker.y + 8.0F}, {marker.x - 8.0F, marker.y}}};
        DrawTriangleFan(diamond.data(), static_cast<int>(diamond.size()), withAlpha(kCyan, 90));
        DrawLineStrip(diamond.data(), static_cast<int>(diamond.size()), kCyan);
        DrawLineV(diamond.back(), diamond.front(), kCyan);
    } else {
        DrawCircleV(marker, 8.0F, withAlpha(kMagenta, 80));
        DrawCircleLines(static_cast<int>(marker.x), static_cast<int>(marker.y), 8.0F, kMagenta);
    }
    centered(factionMarker(operative.faction), {marker.x - 8.0F, marker.y - 8.0F, 16.0F, 16.0F},
             9, kText);
    label(std::to_string(operative.id), {slot.x + 27.0F, slot.y + 5.0F}, 17, color);
    const Vector2 archetype{slot.x + slot.width - 12.0F, slot.y + 14.0F};
    const bool elite = std::any_of(engine.catalogs().characters().begin(),
                                   engine.catalogs().characters().end(),
                                   [&](const UnitTemplate& unit) { return unit.name == operative.name; });
    const bool species = std::any_of(engine.catalogs().species().begin(),
                                     engine.catalogs().species().end(),
                                     [&](const UnitTemplate& unit) { return unit.name == operative.name; });
    if (operative.isHero) {
        DrawPoly(archetype, 5, 8.0F, -90.0F, kAmber);
        DrawPolyLinesEx(archetype, 5, 9.0F, -90.0F, 1.0F, kText);
    } else if (operative.classType == 1) {
        DrawRectangle(static_cast<int>(archetype.x - 7.0F), static_cast<int>(archetype.y - 7.0F),
                      14, 14, withAlpha(kAmber, 120));
        DrawRectangleLines(static_cast<int>(archetype.x - 7.0F), static_cast<int>(archetype.y - 7.0F),
                           14, 14, kAmber);
        centered("J", {archetype.x - 7.0F, archetype.y - 7.0F, 14.0F, 14.0F}, 8, kText);
    } else if (operative.classType == 2) {
        DrawTriangle({archetype.x, archetype.y - 8.0F},
                     {archetype.x + 8.0F, archetype.y + 7.0F},
                     {archetype.x - 8.0F, archetype.y + 7.0F}, withAlpha(kRed, 150));
        centered("E", {archetype.x - 7.0F, archetype.y - 5.0F, 14.0F, 12.0F}, 8, kText);
    } else if (operative.classType == 3) {
        DrawRectangleLines(static_cast<int>(archetype.x - 8.0F), static_cast<int>(archetype.y - 6.0F),
                           16, 12, kGreen);
        DrawLineEx({archetype.x - 5.0F, archetype.y}, {archetype.x + 5.0F, archetype.y}, 1.0F, kGreen);
        DrawLineEx({archetype.x, archetype.y - 4.0F}, {archetype.x, archetype.y + 4.0F}, 1.0F, kGreen);
    } else if (elite) {
        DrawLineEx({archetype.x - 7.0F, archetype.y - 5.0F}, {archetype.x, archetype.y + 2.0F}, 2.0F, kMagenta);
        DrawLineEx({archetype.x, archetype.y + 2.0F}, {archetype.x + 7.0F, archetype.y - 5.0F}, 2.0F, kMagenta);
        DrawLineEx({archetype.x - 7.0F, archetype.y + 1.0F}, {archetype.x, archetype.y + 8.0F}, 2.0F, kMagenta);
        DrawLineEx({archetype.x, archetype.y + 8.0F}, {archetype.x + 7.0F, archetype.y + 1.0F}, 2.0F, kMagenta);
    } else if (species) {
        DrawCircleV(archetype, 8.0F, withAlpha(kGreen, 85));
        DrawCircleLines(static_cast<int>(archetype.x), static_cast<int>(archetype.y), 8.0F, kGreen);
        DrawCircleV(archetype, 2.0F, kText);
    } else {
        const std::array<Vector2, 4> custom{{{archetype.x, archetype.y - 7.0F},
                                             {archetype.x + 7.0F, archetype.y},
                                             {archetype.x, archetype.y + 7.0F},
                                             {archetype.x - 7.0F, archetype.y}}};
        DrawLineStrip(custom.data(), static_cast<int>(custom.size()), kMuted);
        DrawLineV(custom.back(), custom.front(), kMuted);
    }
    label(ellipsis(operative.name, 12), {slot.x + 5.0F, slot.y + 29.0F}, 10, kText);
    const float hpRatio = operative.health > 0
                              ? std::clamp(static_cast<float>(operative.baseHp) /
                                               static_cast<float>(operative.health), 0.0F, 1.0F)
                              : 0.0F;
    DrawRectangle(static_cast<int>(slot.x + 5.0F), static_cast<int>(slot.y + 48.0F),
                  static_cast<int>(slot.width - 10.0F), 6, Color{38, 45, 55, 255});
    DrawRectangle(static_cast<int>(slot.x + 5.0F), static_cast<int>(slot.y + 48.0F),
                  static_cast<int>((slot.width - 10.0F) * hpRatio), 6,
                  hpRatio > 0.35F ? kGreen : kRed);
    if (const Shield* shield = operative.activeShield()) {
        int maximumAbsorption = std::max(1, shield->absorption);
        for (const ShieldDefinition& definition : engine.catalogs().shields()) {
            if (definition.name == shield->name) {
                maximumAbsorption = std::max(1, definition.absorption);
                break;
            }
        }
        if (shield->name == "FISICO") maximumAbsorption = 30;
        if (shield->name == "ANTIPLASMA") maximumAbsorption = 40;
        const float shieldRatio = std::clamp(static_cast<float>(shield->absorption) /
                                                 static_cast<float>(maximumAbsorption),
                                             0.0F, 1.0F);
        DrawRectangle(static_cast<int>(slot.x + 5.0F), static_cast<int>(slot.y + 56.0F),
                      static_cast<int>(slot.width - 10.0F), 4, Color{31, 42, 58, 255});
        DrawRectangle(static_cast<int>(slot.x + 5.0F), static_cast<int>(slot.y + 56.0F),
                      static_cast<int>((slot.width - 10.0F) * shieldRatio), 4, kCyan);
        DrawCircleLines(static_cast<int>(slot.x + slot.width - 10.0F),
                        static_cast<int>(slot.y + slot.height - 11.0F), 6.0F, kCyan);
    }
    label("HP " + std::to_string(std::max(0, operative.baseHp)),
          {slot.x + 5.0F, slot.y + 63.0F}, 8, kMuted);
    if (operative.recentlyConverted) {
        for (int stripe = 0; stripe < 4; ++stripe) {
            const float x = slot.x + 4.0F + static_cast<float>(stripe) * 23.0F;
            DrawLineEx({x, slot.y + 2.0F}, {x + 8.0F, slot.y + slot.height - 2.0F},
                       1.0F, withAlpha(kGreen, 110));
        }
        centered("C", {slot.x + slot.width - 22.0F, slot.y + slot.height - 23.0F, 14.0F, 14.0F},
                 9, kGreen);
    }
    if (!operative.activeWeapon()) {
        DrawLineEx({slot.x + slot.width - 18.0F, slot.y + slot.height - 17.0F},
                   {slot.x + slot.width - 4.0F, slot.y + slot.height - 5.0F}, 2.0F, kRed);
    }
}

void GameApp::Impl::drawEffects() {
    for (const VisualEffect& effect : effects) {
        const float progress = std::clamp(effect.age / effect.duration, 0.0F, 1.0F);
        const float fade = 1.0F - progress;
        Vector2 source = treeCenter;
        Vector2 target = treeCenter;
        if (const auto sourceOperative = operativePositions.find(effect.sourceId);
            sourceOperative != operativePositions.end()) {
            source = sourceOperative->second;
        } else if (const auto sourceNode = nodePositions.find(effect.nodeId);
                   sourceNode != nodePositions.end()) {
            source = sourceNode->second;
        }
        if (const auto targetOperative = operativePositions.find(effect.targetId);
            targetOperative != operativePositions.end()) {
            target = targetOperative->second;
        } else if (const auto targetNode = nodePositions.find(effect.nodeId);
                   targetNode != nodePositions.end()) {
            target = targetNode->second;
        }
        const unsigned char alpha = static_cast<unsigned char>(std::clamp(fade * 255.0F, 0.0F, 255.0F));
        const auto movingPoint = [&](const float t) {
            return Vector2{source.x + (target.x - source.x) * t,
                           source.y + (target.y - source.y) * t};
        };
        const auto beam = [&](const Color color, const float thickness) {
            DrawLineEx(source, target, thickness + 6.0F * fade,
                       withAlpha(color, static_cast<unsigned char>(alpha / 4)));
            DrawLineEx(source, target, thickness, withAlpha(color, alpha));
        };

        if (effect.flavor == EffectFlavor::Plasma) {
            beam(Color{90, 220, 255, 255}, 4.0F);
            DrawLineEx(source, target, 1.2F, withAlpha(kText, alpha));
            const Vector2 pulse = movingPoint(progress);
            DrawCircleV(pulse, 7.0F + fade * 5.0F, withAlpha(kCyan, alpha));
            for (int spark = 0; spark < 7; ++spark) {
                const float angle = static_cast<float>(spark) * 0.897F + progress * 4.0F;
                const float radius = 9.0F + 22.0F * progress;
                DrawLineEx(target,
                           {target.x + std::cos(angle) * radius,
                            target.y + std::sin(angle) * radius},
                           1.5F, withAlpha(kText, alpha));
            }
        } else if (effect.flavor == EffectFlavor::Gauss) {
            DrawLineEx(source, target, 4.0F * fade + 1.0F, withAlpha(kCyan, alpha / 3));
            DrawLineEx(source, target, 0.8F, withAlpha(kText, alpha));
            DrawCircleLines(static_cast<int>(target.x), static_cast<int>(target.y),
                            18.0F + progress * 14.0F, withAlpha(kCyan, alpha));
            DrawLineEx({target.x - 28.0F, target.y}, {target.x + 28.0F, target.y},
                       1.0F, withAlpha(kCyan, alpha));
            DrawLineEx({target.x, target.y - 28.0F}, {target.x, target.y + 28.0F},
                       1.0F, withAlpha(kCyan, alpha));
        } else if (effect.flavor == EffectFlavor::IonBlade) {
            const float sweep = -25.0F + progress * 50.0F;
            for (int slash = 0; slash < 3; ++slash) {
                const float offset = static_cast<float>(slash - 1) * 7.0F;
                DrawLineEx({target.x - 34.0F + sweep, target.y + 28.0F + offset},
                           {target.x + 34.0F + sweep, target.y - 28.0F + offset},
                           slash == 1 ? 4.0F : 1.5F,
                           withAlpha(slash == 1 ? kText : kCyan, alpha));
            }
            DrawCircleLines(static_cast<int>(target.x), static_cast<int>(target.y),
                            17.0F + progress * 25.0F, withAlpha(kCyan, alpha / 2));
        } else if (effect.flavor == EffectFlavor::Emp) {
            for (int ring = 0; ring < 3; ++ring) {
                const float delayed = std::clamp(progress - static_cast<float>(ring) * 0.12F,
                                                 0.0F, 1.0F);
                DrawCircleLines(static_cast<int>(target.x), static_cast<int>(target.y),
                                15.0F + delayed * (65.0F + ring * 18.0F),
                                withAlpha(ring % 2 == 0 ? kCyan : kMagenta, alpha));
            }
            for (int ray = 0; ray < 8; ++ray) {
                const float angle = static_cast<float>(ray) * 0.785F + progress;
                DrawLineEx({target.x + std::cos(angle) * 18.0F,
                            target.y + std::sin(angle) * 18.0F},
                           {target.x + std::cos(angle + 0.12F) * (35.0F + progress * 45.0F),
                            target.y + std::sin(angle + 0.12F) * (35.0F + progress * 45.0F)},
                           1.0F, withAlpha(kText, alpha));
            }
        } else if (effect.flavor == EffectFlavor::Malware) {
            for (int packet = 0; packet < 10; ++packet) {
                const float t = std::fmod(progress + static_cast<float>(packet) * 0.095F, 1.0F);
                Vector2 point = movingPoint(t);
                point.y += std::sin(t * 31.0F + packet) * 7.0F;
                DrawRectangle(static_cast<int>(point.x - 3.0F), static_cast<int>(point.y - 3.0F),
                              6, 6, withAlpha(packet % 2 == 0 ? kGreen : kMagenta, alpha));
            }
            for (int glitch = 0; glitch < 5; ++glitch) {
                const float y = target.y - 24.0F + glitch * 12.0F;
                DrawRectangle(static_cast<int>(target.x - 31.0F + std::sin(progress * 20.0F + glitch) * 9.0F),
                              static_cast<int>(y), 62, 3, withAlpha(kGreen, alpha));
            }
        } else if (effect.flavor == EffectFlavor::Kinetic) {
            DrawPolyLinesEx(target, 6, 29.0F + progress * 18.0F, 30.0F, 3.0F,
                            withAlpha(kCyan, alpha));
            DrawPolyLinesEx(target, 6, 36.0F + progress * 18.0F, 30.0F, 1.0F,
                            withAlpha(kText, alpha / 2));
        } else if (effect.flavor == EffectFlavor::Deflector) {
            DrawCircleLines(static_cast<int>(target.x), static_cast<int>(target.y),
                            42.0F + progress * 55.0F, withAlpha(kMagenta, alpha));
            DrawPolyLinesEx(target, 8, 52.0F + progress * 35.0F, 22.5F, 2.0F,
                            withAlpha(kCyan, alpha));
            for (int spoke = 0; spoke < 8; ++spoke) {
                const float angle = spoke * 0.785F;
                DrawLineEx(target, {target.x + std::cos(angle) * 54.0F,
                                    target.y + std::sin(angle) * 54.0F},
                           1.0F, withAlpha(kCyan, alpha / 2));
            }
        } else if (effect.flavor == EffectFlavor::Reactive) {
            beam(kRed, 2.5F);
            const Vector2 pulse = movingPoint(progress);
            DrawPoly(pulse, 4, 8.0F, 45.0F, withAlpha(kAmber, alpha));
            DrawCircleLines(static_cast<int>(source.x), static_cast<int>(source.y),
                            18.0F + progress * 28.0F, withAlpha(kRed, alpha));
        } else if (effect.flavor == EffectFlavor::Firewall) {
            const float width = 72.0F + progress * 20.0F;
            for (int column = 0; column < 7; ++column) {
                const float x = target.x - width * 0.5F + column * width / 6.0F;
                DrawLineEx({x, target.y - 36.0F}, {x, target.y + 36.0F}, 1.0F,
                           withAlpha(column % 2 == 0 ? kRed : kMagenta, alpha));
            }
            for (int row = 0; row < 5; ++row) {
                const float y = target.y - 36.0F + row * 18.0F;
                DrawLineEx({target.x - width * 0.5F, y}, {target.x + width * 0.5F, y},
                           2.0F, withAlpha(kRed, alpha));
            }
        } else if (effect.flavor == EffectFlavor::Camouflage) {
            for (int ghost = -2; ghost <= 2; ++ghost) {
                const float offset = static_cast<float>(ghost) * (4.0F + progress * 6.0F);
                DrawRectangleLinesEx({target.x - 31.0F + offset, target.y - 27.0F,
                                      62.0F, 54.0F}, 1.0F,
                                     withAlpha(ghost % 2 == 0 ? kCyan : kMagenta,
                                               static_cast<unsigned char>(alpha / 2)));
            }
            for (int scan = 0; scan < 6; ++scan) {
                const float y = target.y - 25.0F + scan * 10.0F;
                DrawLineEx({target.x - 34.0F + std::sin(progress * 18.0F + scan) * 8.0F, y},
                           {target.x + 34.0F, y}, 1.0F, withAlpha(kText, alpha / 2));
            }
        } else if (effect.flavor == EffectFlavor::Trojan) {
            const Color hack = kGreen;
            for (int line = 0; line < 7; ++line) {
                const float offset = static_cast<float>(line - 3) * 5.0F;
                DrawLineEx({source.x + offset, source.y},
                           {target.x + offset * std::sin(progress * 8.0F), target.y},
                           1.0F, withAlpha(hack, static_cast<unsigned char>(alpha * 0.8F)));
            }
            DrawRectangleLinesEx({target.x - 34.0F - progress * 8.0F,
                                  target.y - 27.0F - progress * 8.0F,
                                  68.0F + progress * 16.0F, 54.0F + progress * 16.0F},
                                 2.0F, withAlpha(hack, alpha));
        } else if (effect.flavor == EffectFlavor::Disruption) {
            for (int particle = 0; particle < 18; ++particle) {
                const float angle = static_cast<float>(particle) * 0.349F + progress * 5.0F;
                const float radius = 12.0F + progress * 48.0F;
                DrawRectangle(static_cast<int>(target.x + std::cos(angle) * radius),
                              static_cast<int>(target.y + std::sin(angle) * radius),
                              3, 3, withAlpha(kMagenta, alpha));
            }
            DrawCircleLines(static_cast<int>(target.x), static_cast<int>(target.y),
                            18.0F + progress * 55.0F, withAlpha(kCyan, alpha));
        } else if (effect.flavor == EffectFlavor::Split) {
            const float separation = 18.0F + progress * 72.0F;
            DrawRectangleRoundedLinesEx({target.x - kNodeWidth * 0.5F - separation,
                                         target.y - kNodeHeight * 0.5F,
                                         kNodeWidth, kNodeHeight},
                                        0.12F, 6, 2.0F, withAlpha(kCyan, alpha));
            DrawRectangleRoundedLinesEx({target.x - kNodeWidth * 0.5F + separation,
                                         target.y - kNodeHeight * 0.5F,
                                         kNodeWidth, kNodeHeight},
                                        0.12F, 6, 2.0F, withAlpha(kMagenta, alpha));
            const Vector2 median{target.x, target.y - 12.0F - progress * 68.0F};
            DrawPoly(median, 4, 10.0F, 45.0F, withAlpha(kAmber, alpha));
        } else if (effect.flavor == EffectFlavor::Borrow) {
            DrawRectangleRoundedLinesEx({target.x - kNodeWidth * 0.5F, target.y - kNodeHeight * 0.5F,
                                         kNodeWidth, kNodeHeight},
                                        0.12F, 6, 2.0F, withAlpha(kAmber, alpha));
            const Vector2 key{target.x + kNodeWidth * (0.65F - progress), target.y};
            DrawRectangleRounded({key.x - 16.0F, key.y - 13.0F, 32.0F, 26.0F},
                                 0.12F, 4, withAlpha(kCyan, alpha));
            DrawRectangleRoundedLinesEx({key.x - 16.0F, key.y - 13.0F, 32.0F, 26.0F},
                                        0.12F, 4, 2.0F, withAlpha(kText, alpha));
        } else if (effect.flavor == EffectFlavor::Merge) {
            const float approach = (1.0F - progress) * (kNodeWidth * 0.7F);
            DrawRectangleRoundedLinesEx({target.x - kNodeWidth * 0.5F - approach,
                                         target.y - kNodeHeight * 0.5F,
                                         kNodeWidth, kNodeHeight},
                                        0.12F, 6, 2.0F, withAlpha(kMagenta, alpha));
            DrawRectangleRoundedLinesEx({target.x - kNodeWidth * 0.5F + approach,
                                         target.y - kNodeHeight * 0.5F,
                                         kNodeWidth, kNodeHeight},
                                        0.12F, 6, 2.0F, withAlpha(kCyan, alpha));
        } else if (effect.flavor == EffectFlavor::RootReduction) {
            for (int ring = 0; ring < 3; ++ring) {
                DrawCircleLines(static_cast<int>(target.x), static_cast<int>(target.y),
                                28.0F + ring * 18.0F + progress * 35.0F,
                                withAlpha(kAmber, static_cast<unsigned char>(alpha / (ring + 1))));
            }
            DrawTriangle({target.x, target.y + 36.0F},
                         {target.x - 12.0F, target.y + 12.0F},
                         {target.x + 12.0F, target.y + 12.0F}, withAlpha(kAmber, alpha));
        } else if (effect.type == EventType::ShieldBroken) {
            for (int segment = 0; segment < 6; ++segment) {
                const float a0 = static_cast<float>(segment) * 1.047F;
                const float a1 = a0 + 0.72F;
                const float radius = 25.0F + progress * 50.0F;
                DrawLineEx({target.x + std::cos(a0) * radius, target.y + std::sin(a0) * radius},
                           {target.x + std::cos(a1) * radius, target.y + std::sin(a1) * radius},
                           2.0F, withAlpha(kCyan, alpha));
            }
        } else {
            const Color color = effect.type == EventType::DamageAbsorbed ? kCyan : kAmber;
            beam(color, 1.5F);
            const Vector2 pulse = movingPoint(progress);
            DrawRectangle(static_cast<int>(pulse.x - 5.0F), static_cast<int>(pulse.y - 5.0F),
                          10, 10, withAlpha(kText, alpha));
            DrawCircleLines(static_cast<int>(target.x), static_cast<int>(target.y),
                            12.0F + progress * 34.0F, withAlpha(color, alpha));
        }
        if (!effectsReduced && progress < 0.75F) {
            centered(flavorLabel(effect.flavor, effect.type),
                     {target.x - 65.0F, target.y - 78.0F - progress * 18.0F, 130.0F, 22.0F},
                     12, withAlpha(kText, alpha));
        }
    }
}

void GameApp::Impl::drawInspector(const GameSnapshot& snapshot) {
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    const float x = width - kSideWidth - 4.0F;
    const float available = height - kHeaderHeight - kFooterHeight - 16.0F;
    const float inspectorHeight = showInspector ? std::max(245.0F, available * 0.55F) : 0.0F;
    if (!showInspector) return;
    const Rectangle bounds{x, kHeaderHeight + 8.0F, kSideWidth - 8.0F, inspectorHeight};
    panel(bounds, selected() ? factionColor(selected()->faction) : kCyan);
    label("INSPECTOR TACTICO [I]", {bounds.x + 14.0F, bounds.y + 13.0F}, 16, kText);
    DrawLine(static_cast<int>(bounds.x + 12.0F), static_cast<int>(bounds.y + 42.0F),
             static_cast<int>(bounds.x + bounds.width - 12.0F), static_cast<int>(bounds.y + 42.0F), kLine);
    const Rectangle scrollArea{bounds.x + 6.0F, bounds.y + 48.0F, bounds.width - 12.0F, bounds.height - 58.0F};
    if (CheckCollisionPointRec(GetMousePosition(), scrollArea)) inspectorScroll += GetMouseWheelMove() * 28.0F;
    BeginScissorMode(static_cast<int>(scrollArea.x), static_cast<int>(scrollArea.y),
                     static_cast<int>(scrollArea.width), static_cast<int>(scrollArea.height));
    float y = scrollArea.y + inspectorScroll + 4.0F;
    const Operative* operative = selected();
    if (operative) {
        const Color color = factionColor(operative->faction);
        label(ellipsis(operative->name, 31), {bounds.x + 15.0F, y}, 19, color);
        y += 28.0F;
        label("ID " + std::to_string(operative->id) + "   " + std::string(factionName(operative->faction)) +
                  " [" + factionMarker(operative->faction) + "]" + (operative->isHero ? "   HEROE" : ""),
              {bounds.x + 15.0F, y}, 14, kText);
        y += 27.0F;
        label("HP " + std::to_string(operative->baseHp) + "/" + std::to_string(operative->health) +
                  "   ATQ " + std::to_string(operative->attack) + "   RAP " + std::to_string(operative->speed),
              {bounds.x + 15.0F, y}, 14, kText);
        y += 29.0F;
        if (operative->recentlyConverted) {
            label("CONTROL MENTAL: NO ACTUA ESTE COMBATE", {bounds.x + 15.0F, y}, 12, kGreen);
            y += 24.0F;
        }
        label("ARSENAL FIFO (FRENTE ->)", {bounds.x + 15.0F, y}, 13, kCyan);
        y += 22.0F;
        if (operative->weapons.empty()) {
            label("Sin armas", {bounds.x + 22.0F, y}, 13, kRed);
            y += 22.0F;
        } else {
            int position = 0;
            for (const Weapon& weapon : operative->weapons) {
                const std::string prefix = position++ == 0 ? "> " : "  ";
                label(prefix + ellipsis(weapon.name.empty() ? weapon.blastType : weapon.name, 24),
                      {bounds.x + 18.0F, y}, 12, position == 1 ? kText : kMuted);
                y += 17.0F;
                label("  DMG " + std::to_string(weapon.damage) + "  MUN " +
                          std::to_string(weapon.ammunition) + "  COSTE " + std::to_string(weapon.useCost),
                      {bounds.x + 26.0F, y}, 10, kMuted);
                y += 20.0F;
            }
        }
        y += 6.0F;
        label("ESCUDOS LIFO (TOPE PRIMERO)", {bounds.x + 15.0F, y}, 13, kMagenta);
        y += 22.0F;
        if (operative->shields.empty()) {
            label("Sin escudos", {bounds.x + 22.0F, y}, 13, kRed);
            y += 22.0F;
        } else {
            for (auto iterator = operative->shields.rbegin(); iterator != operative->shields.rend(); ++iterator) {
                label((iterator == operative->shields.rbegin() ? "> " : "  ") + ellipsis(iterator->name, 24),
                      {bounds.x + 18.0F, y}, 12,
                      iterator == operative->shields.rbegin() ? kText : kMuted);
                y += 17.0F;
                label("  ABS " + std::to_string(iterator->absorption) + "  DUR " +
                          std::to_string(iterator->durability),
                      {bounds.x + 26.0F, y}, 10, kMuted);
                y += 20.0F;
            }
        }
    } else if (selectedNode != 0) {
        const auto node = snapshot.tree.findNode(selectedNode);
        if (node) {
            label("NEXO " + std::to_string(node->id), {bounds.x + 15.0F, y}, 19, kCyan);
            y += 31.0F;
            label("CLAVES: " + std::to_string(node->keys.size()) + "/3", {bounds.x + 15.0F, y}, 14, kText);
            y += 25.0F;
            std::string keys;
            for (const int key : node->keys) keys += (keys.empty() ? "" : " < ") + std::to_string(key);
            label(keys.empty() ? "Nodo sin claves" : keys, {bounds.x + 15.0F, y}, 15, kAmber);
            y += 28.0F;
            label(node->leaf ? "HOJA" : "INTERNO // " + std::to_string(node->children.size()) + " RAMAS",
                  {bounds.x + 15.0F, y}, 14, kMuted);
            y += 28.0F;
            if (node->parentId) label("PADRE: " + std::to_string(*node->parentId), {bounds.x + 15.0F, y}, 13, kMuted);
            else label("RAIZ DE YGGDRASIL", {bounds.x + 15.0F, y}, 13, kGreen);
        }
    } else {
        wrapped("Haz clic sobre un slot para inspeccionar HP, iniciativa, cola completa de armas y pila completa de escudos.",
                {bounds.x + 15.0F, y, bounds.width - 30.0F, 120.0F}, 15, kMuted, 6.0F);
        y += 130.0F;
        label("FORMAS:  <> N = NEON", {bounds.x + 15.0F, y}, 13, kCyan);
        y += 24.0F;
        label("          ( ) O = OMEGA", {bounds.x + 15.0F, y}, 13, kMagenta);
    }
    EndScissorMode();
    const float contentHeight = std::max(0.0F, y - scrollArea.y - inspectorScroll);
    inspectorScroll = std::clamp(inspectorScroll,
                                 std::min(0.0F, scrollArea.height - contentHeight - 10.0F), 0.0F);

    if (operative && engine.canUseWorkshop()) {
        const Rectangle workshop{bounds.x + bounds.width - 125.0F, bounds.y + 8.0F, 112.0F, 30.0F};
        if (button(workshop, "TALLER [W]", true, kAmber, 12)) {
            openWorkshop();
        }
    }
}

void GameApp::Impl::drawEventLog() {
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    const float x = width - kSideWidth - 4.0F;
    const float available = height - kHeaderHeight - kFooterHeight - 16.0F;
    const float inspectorHeight = showInspector ? std::max(245.0F, available * 0.55F) : 0.0F;
    const float y = kHeaderHeight + 8.0F + inspectorHeight + (showInspector ? 8.0F : 0.0F);
    const Rectangle bounds{x, y, kSideWidth - 8.0F,
                           kHeaderHeight + available - y};
    panel(bounds, kMagenta);
    label("REGISTRO DE BATALLA", {bounds.x + 14.0F, bounds.y + 12.0F}, 15, kText);
    label(std::to_string(engine.history().size()) + " EVENTOS", {bounds.x + bounds.width - 92.0F, bounds.y + 13.0F},
          11, kMuted);
    const Rectangle list{bounds.x + 5.0F, bounds.y + 42.0F, bounds.width - 10.0F, bounds.height - 49.0F};
    const float itemHeight = 61.0F;
    const float contentHeight = static_cast<float>(visibleEvents.size()) * itemHeight;
    const float minimumScroll = std::min(0.0F, list.height - contentHeight);
    if (logFollowTail) logScroll = minimumScroll;
    if (CheckCollisionPointRec(GetMousePosition(), list)) {
        const float wheel = GetMouseWheelMove();
        if (wheel != 0.0F) {
            logScroll += wheel * itemHeight;
            logFollowTail = false;
        }
    }
    logScroll = std::clamp(logScroll, minimumScroll, 0.0F);
    if (std::abs(logScroll - minimumScroll) < 1.0F) logFollowTail = true;
    BeginScissorMode(static_cast<int>(list.x), static_cast<int>(list.y),
                     static_cast<int>(list.width), static_cast<int>(list.height));
    float itemY = list.y + logScroll;
    for (const GameEvent& event : visibleEvents) {
        if (itemY + itemHeight >= list.y && itemY <= list.y + list.height) {
            const Color color = event.type == EventType::Warning ? kRed
                              : event.type == EventType::VictoryDeclared ? kGreen
                              : event.faction == Faction::Neon ? kCyan
                              : event.faction == Faction::Omega ? kMagenta : kMuted;
            DrawRectangle(static_cast<int>(list.x + 2.0F), static_cast<int>(itemY + 2.0F),
                          static_cast<int>(list.width - 4.0F), static_cast<int>(itemHeight - 4.0F),
                          Color{8, 16, 32, 205});
            DrawRectangle(static_cast<int>(list.x + 3.0F), static_cast<int>(itemY + 7.0F),
                          3, static_cast<int>(itemHeight - 14.0F), color);
            label("#" + std::to_string(event.sequence) + " T" + std::to_string(event.turn),
                  {list.x + 12.0F, itemY + 7.0F}, 10, color);
            label(ellipsis(event.title, 31), {list.x + 68.0F, itemY + 6.0F}, 13, kText);
            wrapped(event.detail, {list.x + 12.0F, itemY + 28.0F, list.width - 22.0F, 28.0F},
                    10, kMuted, 2.0F);
        }
        itemY += itemHeight;
    }
    EndScissorMode();
    if (visibleEvents.empty()) centered("SIN EVENTOS VISIBLES", list, 13, kMuted);
}

void GameApp::Impl::drawBattleFooter() {
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    const float y = height - kFooterHeight;
    DrawRectangle(0, static_cast<int>(y), GetScreenWidth(), static_cast<int>(kFooterHeight),
                  Color{5, 10, 28, 250});
    DrawLine(0, static_cast<int>(y), GetScreenWidth(), static_cast<int>(y), kLine);
    const float available = width - 20.0F;
    const float gap = 5.0F;
    const int count = config.mode == GameMode::AiVsAi ? 9 : 8;
    const float buttonWidth = std::clamp((available - gap * static_cast<float>(count - 1)) /
                                             static_cast<float>(count), 76.0F, 150.0F);
    float x = 10.0F;
    auto next = [&]() {
        const Rectangle result{x, y + 10.0F, buttonWidth, 40.0F};
        x += buttonWidth + gap;
        return result;
    };
    const bool workshopReady = config.mode == GameMode::Manual && engine.awaitingWorkshop() &&
                               !engine.hasQueuedEvents();
    if (button(next(), workshopReady ? "LISTO [ESP]" : "CONT. [ESP]",
               modal == Modal::None, kGreen, 13)) {
        continueAction();
    }
    if (button(next(), "EVENTO [E]", modal == Modal::None, kCyan, 13)) advanceEngineUnit(true);
    if (button(next(), paused ? "PLAY [P]" : "PAUSA [P]", modal == Modal::None, kAmber, 13)) paused = !paused;
    if (config.mode == GameMode::AiVsAi) {
        if (button(next(), "TURNO [T]", modal == Modal::None, kMagenta, 13)) {
            stepUntilTurn = engine.snapshot().turn;
            turnStepping = true;
            paused = false;
        }
    }
    if (button(next(), speedLabel(speedIndex), modal == Modal::None, kMagenta, 13)) {
        speedIndex = (speedIndex + 1) % 5;
    }
    if (button(next(), "CENTRAR [C]", modal == Modal::None, kCyan, 13)) centerCamera();
    if (button(next(), showInspector ? "OCULTAR [I]" : "INSPECTOR [I]", modal == Modal::None, kCyan, 12)) {
        showInspector = !showInspector;
    }
    if (button(next(), "AYUDA [H]", modal == Modal::None, kAmber, 13)) modal = Modal::Help;
    if (button(next(), "MENU", modal == Modal::None, kRed, 13)) {
        paused = true;
        screen = Screen::MainMenu;
        modal = Modal::None;
    }
}

RecruitCommand GameApp::Impl::recruitCommand() const {
    RecruitCommand command;
    command.mode = recruitmentMode;
    command.templateKind = templateKind;
    command.templateIndex = templateIndex;
    command.classType = quickClass;
    command.customName = customName;
    command.weaponIndex = weaponIndex;
    command.shieldIndex = shieldIndex;
    parseInteger(recruitId, command.id);
    parseInteger(customHp, command.health);
    parseInteger(customAttack, command.attack);
    parseInteger(customSpeed, command.speed);
    return command;
}

void GameApp::Impl::drawRecruitModal() {
    drawModalShade();
    const float screenHeight = static_cast<float>(GetScreenHeight());
    const Rectangle box = modalRect(std::min(860.0F, static_cast<float>(GetScreenWidth()) - 28.0F),
                                    std::min(700.0F, screenHeight - 24.0F));
    panel(box, factionColor(engine.pendingDecision().faction), 252);
    const PendingDecision decision = engine.pendingDecision();
    const Color accent = factionColor(decision.faction);
    label("RECLUTAMIENTO // " + std::string(factionName(decision.faction)),
          {box.x + 24.0F, box.y + 18.0F}, 23, accent);
    label("Quedan " + std::to_string(decision.remainingInsertions) + " insercion(es)  |  Tier " +
              std::to_string(decision.recruitmentTier),
          {box.x + box.width - 310.0F, box.y + 23.0F}, 13, kMuted);
    DrawLine(static_cast<int>(box.x + 20.0F), static_cast<int>(box.y + 55.0F),
             static_cast<int>(box.x + box.width - 20.0F), static_cast<int>(box.y + 55.0F), kLine);

    float y = box.y + 70.0F;
    const float tabWidth = (box.width - 64.0F) / 3.0F;
    if (decision.heroOnly) {
        if (recruitmentMode != RecruitmentMode::Catalog) activeField = 0;
        recruitmentMode = RecruitmentMode::Catalog;
        templateKind = TemplateKind::Hero;
    }
    const std::array<RecruitmentMode, 3> modes{RecruitmentMode::Catalog,
                                                RecruitmentMode::QuickClass,
                                                RecruitmentMode::Custom};
    for (int index = 0; index < 3; ++index) {
        const RecruitmentMode candidate = modes[static_cast<std::size_t>(index)];
        const bool enabled = !decision.heroOnly || candidate == RecruitmentMode::Catalog;
        const Color tabColor = recruitmentMode == candidate ? accent : kMuted;
        if (button({box.x + 20.0F + index * (tabWidth + 4.0F), y, tabWidth, 40.0F},
                   recruitmentName(candidate), enabled, tabColor, 14)) {
            recruitmentMode = candidate;
            activeField = 0;
            errorMessage.clear();
        }
    }
    y += 56.0F;
    label("ID ESTRUCTURAL (1-999)", {box.x + 28.0F, y + 11.0F}, 15, kMuted);
    textField({box.x + 275.0F, y, 160.0F, 40.0F}, recruitId, 201, true, 3, "ID");
    label(engine.tree().contains([&]() { int value = 0; parseInteger(recruitId, value); return value; }())
              ? "OCUPADO" : "CLAVE LIBRE",
          {box.x + 454.0F, y + 12.0F}, 13,
          engine.tree().contains([&]() { int value = 0; parseInteger(recruitId, value); return value; }())
              ? kRed : kGreen);
    y += 58.0F;

    if (recruitmentMode == RecruitmentMode::Catalog) {
        const float kindWidth = 154.0F;
        const bool speciesEnabled = !decision.heroOnly;
        const bool characterEnabled = !decision.heroOnly && decision.recruitmentTier >= 2;
        const bool heroEnabled = decision.heroOnly;
        if (button({box.x + 28.0F, y, kindWidth, 37.0F}, "ESPECIES", speciesEnabled,
                   templateKind == TemplateKind::Species ? accent : kMuted, 13)) {
            templateKind = TemplateKind::Species;
            templateIndex = 0;
        }
        if (button({box.x + 190.0F, y, kindWidth, 37.0F}, "PERSONAJES", characterEnabled,
                   templateKind == TemplateKind::Character ? accent : kMuted, 13)) {
            templateKind = TemplateKind::Character;
            templateIndex = 0;
        }
        if (button({box.x + 352.0F, y, kindWidth, 37.0F}, "HEROES", heroEnabled,
                   templateKind == TemplateKind::Hero ? kAmber : kMuted, 13)) {
            templateKind = TemplateKind::Hero;
            templateIndex = 0;
        }
        if (decision.heroOnly) label("TURNO ESPECIAL: SOLO HEROE DE CATALOGO", {box.x + 530.0F, y + 11.0F}, 12, kAmber);
        else if (decision.recruitmentTier < 2) label("PERSONAJES DESDE TURNO 3", {box.x + 530.0F, y + 11.0F}, 12, kMuted);
        y += 54.0F;

        const std::vector<UnitTemplate>* pool = nullptr;
        if (templateKind == TemplateKind::Species) pool = &engine.catalogs().species();
        else if (templateKind == TemplateKind::Character) pool = &engine.catalogs().characters();
        else pool = &engine.catalogs().heroes();
        if (pool->empty()) {
            label("Catalogo vacio", {box.x + 30.0F, y + 12.0F}, 18, kRed);
        } else {
            templateIndex = std::clamp(templateIndex, 0, static_cast<int>(pool->size()) - 1);
            const UnitTemplate& unit = (*pool)[static_cast<std::size_t>(templateIndex)];
            selector({box.x + 28.0F, y, box.width - 56.0F, 48.0F}, unit.name,
                     templateIndex, static_cast<int>(pool->size()), accent);
            y += 64.0F;
            const Rectangle stats{box.x + 28.0F, y, box.width - 56.0F, 106.0F};
            panel(stats, templateKind == TemplateKind::Hero ? kAmber : accent, 218);
            label("PLANTILLA " + std::to_string(unit.id), {stats.x + 15.0F, stats.y + 14.0F}, 13, kMuted);
            label("FORT " + std::to_string(unit.fortitude), {stats.x + 16.0F, stats.y + 45.0F}, 17, kText);
            label("DANO " + std::to_string(unit.damage), {stats.x + 178.0F, stats.y + 45.0F}, 17, kText);
            label("HP " + std::to_string(unit.health), {stats.x + 340.0F, stats.y + 45.0F}, 17, kText);
            label("RAP " + std::to_string(unit.speed), {stats.x + 500.0F, stats.y + 45.0F}, 17, kText);
            wrapped(templateKind == TemplateKind::Hero
                        ? "El motor equipa TROYANO y DISRUPCION; objetivo y destino se solicitan durante combate."
                        : "Arma y escudo se asignan deterministamente desde los catalogos usando el ID.",
                    {stats.x + 16.0F, stats.y + 75.0F, stats.width - 32.0F, 25.0F}, 12,
                    templateKind == TemplateKind::Hero ? kAmber : kMuted, 3.0F);
            y += 118.0F;
        }
    } else if (recruitmentMode == RecruitmentMode::QuickClass) {
        label("CLASE CANONICA", {box.x + 28.0F, y + 10.0F}, 15, kMuted);
        const std::array<const char*, 3> classes{"JUGGERNAUT", "EJECUTOR", "HACKER / ESPECTRO"};
        for (int index = 0; index < 3; ++index) {
            if (button({box.x + 210.0F + index * 195.0F, y, 184.0F, 40.0F},
                       classes[static_cast<std::size_t>(index)], true,
                       quickClass == index + 1 ? accent : kMuted, 13)) {
                quickClass = index + 1;
                const auto free = engine.freeIds();
                const auto found = std::find_if(free.begin(), free.end(), [&](const int id) {
                    return quickClass == 1 ? id >= 800 : quickClass == 2 ? id >= 500 && id <= 799 : id <= 499;
                });
                if (found != free.end()) recruitId = std::to_string(*found);
            }
        }
        y += 64.0F;
        const Rectangle classInfo{box.x + 28.0F, y, box.width - 56.0F, 152.0F};
        panel(classInfo, accent, 218);
        const std::array<const char*, 3> ranges{"800-999", "500-799", "1-499"};
        const std::array<const char*, 3> descriptions{
            "HP 150 | ATQ 15 | RAP 30 | escudo fisico | disparo simple",
            "HP 100 | ATQ 30 | RAP 50 | escudo antiplasma | disparo simple",
            "HP 60 | ATQ 10 | RAP 70 | sin escudo | disparo simple"};
        label("RANGO DE ID: " + std::string(ranges[static_cast<std::size_t>(quickClass - 1)]),
              {classInfo.x + 18.0F, classInfo.y + 20.0F}, 18, kAmber);
        label(descriptions[static_cast<std::size_t>(quickClass - 1)],
              {classInfo.x + 18.0F, classInfo.y + 58.0F}, 17, kText);
        wrapped("El motor genera nombre, equipo y variante con el RNG sembrado. OMEGA usa dano; NEON usa fuerza.",
                {classInfo.x + 18.0F, classInfo.y + 96.0F, classInfo.width - 36.0F, 44.0F}, 14, kMuted);
        y += 166.0F;
    } else {
        const float left = box.x + 28.0F;
        label("NOMBRE", {left, y + 10.0F}, 14, kMuted);
        textField({left + 100.0F, y, 270.0F, 40.0F}, customName, 202, false, 32, "Operativo");
        y += 54.0F;
        label("HP", {left, y + 10.0F}, 14, kMuted);
        textField({left + 55.0F, y, 122.0F, 40.0F}, customHp, 203, true, 6, "100");
        label("ATAQUE", {left + 205.0F, y + 10.0F}, 14, kMuted);
        textField({left + 300.0F, y, 122.0F, 40.0F}, customAttack, 204, true, 6, "50");
        label("RAPIDEZ", {left + 450.0F, y + 10.0F}, 14, kMuted);
        textField({left + 550.0F, y, 122.0F, 40.0F}, customSpeed, 205, true, 6, "70");
        y += 60.0F;
        const auto& weapons = engine.catalogs().weapons();
        const auto& shields = engine.catalogs().shields();
        label("ARMA FIFO INICIAL", {left, y + 12.0F}, 14, kCyan);
        if (!weapons.empty()) {
            weaponIndex = std::clamp(weaponIndex, 0, static_cast<int>(weapons.size()) - 1);
            selector({left + 200.0F, y, box.width - 256.0F, 44.0F},
                     weapons[static_cast<std::size_t>(weaponIndex)].name, weaponIndex,
                     static_cast<int>(weapons.size()), kCyan);
        }
        y += 58.0F;
        label("ESCUDO LIFO INICIAL", {left, y + 12.0F}, 14, kMagenta);
        if (!shields.empty()) {
            shieldIndex = std::clamp(shieldIndex, 0, static_cast<int>(shields.size()) - 1);
            selector({left + 200.0F, y, box.width - 256.0F, 44.0F},
                     shields[static_cast<std::size_t>(shieldIndex)].name, shieldIndex,
                     static_cast<int>(shields.size()), kMagenta);
        }
        y += 62.0F;
    }

    RecruitCommand command = recruitCommand();
    std::string validation;
    const bool valid = engine.validateRecruit(command, &validation);
    const float footerY = box.y + box.height - 86.0F;
    if (!valid) wrapped(validation, {box.x + 28.0F, footerY - 47.0F, box.width - 56.0F, 40.0F},
                        13, kRed, 3.0F);
    else label("COMANDO VALIDO // LISTO PARA INSERTAR", {box.x + 28.0F, footerY - 31.0F}, 13, kGreen);
    if (button({box.x + box.width - 278.0F, footerY, 250.0F, 48.0F}, "MATERIALIZAR [ENTER]", valid,
               accent, 16) || (valid && activeField == 0 && IsKeyPressed(KEY_ENTER))) {
        std::string failure;
        if (engine.submitRecruit(command, &failure)) {
            modal = Modal::None;
            pendingModalDeferred = false;
            errorMessage.clear();
            cameraNeedsCenter = engine.snapshot().tree.size <= 3;
        } else {
            errorMessage = failure;
        }
    }
    if (button({box.x + 28.0F, footerY, 210.0F, 48.0F}, "INSPECCIONAR TABLERO", true, kMuted, 14)) {
        modal = Modal::None;
        pendingModalDeferred = true;
        paused = true;
    }
}

void GameApp::Impl::drawTacticalModal(const bool disruption) {
    drawModalShade();
    const PendingDecision decision = engine.pendingDecision();
    const Rectangle box = modalRect(760.0F, disruption ? 610.0F : 540.0F);
    const Color accent = disruption ? kMagenta : kGreen;
    panel(box, accent, 252);
    label(disruption ? "VECTOR DE DISRUPCION" : "TROYANO // CONTROL MENTAL",
          {box.x + 24.0F, box.y + 20.0F}, 23, accent);
    label("HEROE ATACANTE ID " + std::to_string(decision.attackerId),
          {box.x + 24.0F, box.y + 54.0F}, 13, kMuted);
    wrapped(decision.prompt, {box.x + 24.0F, box.y + 82.0F, box.width - 48.0F, 42.0F},
            14, kText, 4.0F);
    label("OBJETIVO ENEMIGO VALIDO", {box.x + 24.0F, box.y + 132.0F}, 14, kMuted);

    constexpr int pageSize = 8;
    const int pageCount = std::max(1, (static_cast<int>(decision.candidates.size()) + pageSize - 1) / pageSize);
    tacticalPage = std::clamp(tacticalPage, 0, pageCount - 1);
    const int begin = tacticalPage * pageSize;
    const int end = std::min(static_cast<int>(decision.candidates.size()), begin + pageSize);
    for (int visible = 0; visible < pageSize; ++visible) {
        const int candidateIndex = begin + visible;
        const int column = visible % 4;
        const int row = visible / 4;
        const Rectangle targetButton{box.x + 24.0F + column * 177.0F,
                                     box.y + 160.0F + row * 54.0F, 166.0F, 44.0F};
        if (candidateIndex < end) {
            const int id = decision.candidates[static_cast<std::size_t>(candidateIndex)];
            const Operative* target = engine.tree().find(id);
            const std::string text = "ID " + std::to_string(id) + "  " +
                                     (target ? ellipsis(target->name, 11) : "?");
            if (button(targetButton, text, true, tacticalTarget == id ? accent : kMuted, 12)) {
                tacticalTarget = id;
                errorMessage.clear();
            }
        } else {
            DrawRectangleRoundedLinesEx(targetButton, 0.1F, 4, 1.0F, Color{30, 42, 58, 90});
        }
    }
    const float pagingY = box.y + 273.0F;
    if (pageCount > 1) {
        if (button({box.x + 24.0F, pagingY, 42.0F, 31.0F}, "<", tacticalPage > 0, accent, 14)) --tacticalPage;
        label("PAGINA " + std::to_string(tacticalPage + 1) + "/" + std::to_string(pageCount),
              {box.x + 78.0F, pagingY + 8.0F}, 12, kMuted);
        if (button({box.x + 170.0F, pagingY, 42.0F, 31.0F}, ">", tacticalPage + 1 < pageCount, accent, 14)) ++tacticalPage;
    }

    float y = box.y + 321.0F;
    const Operative* target = engine.tree().find(tacticalTarget);
    const Rectangle preview{box.x + 24.0F, y, box.width - 48.0F, 92.0F};
    panel(preview, target ? factionColor(target->faction) : kLine, 220);
    if (target) {
        label(ellipsis(target->name, 30) + " // ID " + std::to_string(target->id),
              {preview.x + 15.0F, preview.y + 13.0F}, 17, factionColor(target->faction));
        label("HP " + std::to_string(target->baseHp) + "  ATQ " + std::to_string(target->attack) +
                  "  RAP " + std::to_string(target->speed) + (target->isHero ? "  HEROE" : ""),
              {preview.x + 15.0F, preview.y + 43.0F}, 14, kText);
        const Shield* active = target->activeShield();
        label(active ? "ESCUDO: " + ellipsis(active->name, 34) : "SIN ESCUDO ACTIVO",
              {preview.x + 15.0F, preview.y + 67.0F}, 12,
              active && active->name == "Cortafuegos Cuántico" ? kRed : kMuted);
    } else {
        centered("SELECCIONA UN OBJETIVO", preview, 15, kMuted);
    }
    y += 107.0F;

    int destination = 0;
    bool destinationValid = true;
    if (disruption) {
        label("NUEVO ID ESTRUCTURAL (1-999)", {box.x + 28.0F, y + 11.0F}, 14, kMuted);
        textField({box.x + 314.0F, y, 150.0F, 42.0F}, disruptionDestination, 301, true, 3, "ID");
        destinationValid = parseInteger(disruptionDestination, destination) && destination >= 1 &&
                           destination <= 999 && !engine.tree().contains(destination);
        label(destinationValid ? "DESTINO LIBRE" : "ID INVALIDO U OCUPADO",
              {box.x + 484.0F, y + 13.0F}, 13, destinationValid ? kGreen : kRed);
        y += 57.0F;
    }
    const bool targetValid = std::find(decision.candidates.begin(), decision.candidates.end(), tacticalTarget) !=
                             decision.candidates.end();
    const bool valid = targetValid && destinationValid;
    if (!errorMessage.empty()) label(ellipsis(errorMessage, 76), {box.x + 24.0F, box.y + box.height - 100.0F}, 12, kRed);
    if (button({box.x + box.width - 280.0F, box.y + box.height - 66.0F, 256.0F, 44.0F},
               disruption ? "PROGRAMAR REUBICACION" : "INYECTAR TROYANO", valid, accent, 15)) {
        TacticalCommand command;
        command.targetId = tacticalTarget;
        command.destinationId = destination;
        std::string failure;
        if (engine.submitTactical(command, &failure)) {
            modal = Modal::None;
            errorMessage.clear();
            pendingModalDeferred = false;
        } else {
            errorMessage = failure;
        }
    }
    if (button({box.x + 24.0F, box.y + box.height - 66.0F, 190.0F, 44.0F},
               "INSPECCIONAR", true, kMuted, 14)) {
        modal = Modal::None;
        pendingModalDeferred = true;
        paused = true;
    }
}

void GameApp::Impl::applyWorkshop(EditCommand command) {
    const int oldId = selectedOperative;
    command.operativeId = oldId;
    const EditKind kind = command.kind;
    std::string failure;
    if (!engine.editOperative(command, &failure)) {
        errorMessage = failure;
        return;
    }
    errorMessage.clear();
    if (kind == EditKind::ChangeId) {
        selectedOperative = command.value;
        cameraNeedsCenter = true;
    } else if (kind == EditKind::DeleteOperative) {
        selectedOperative = 0;
        selectedNode = 0;
        deleteArmed = false;
        modal = Modal::None;
        cameraNeedsCenter = true;
    }
    if (selected()) syncWorkshopFields();
}

void GameApp::Impl::drawWorkshopModal() {
    drawModalShade();
    const Operative* operative = selected();
    if (!operative || !engine.canUseWorkshop()) {
        modal = Modal::None;
        return;
    }
    const Rectangle box = modalRect(std::min(980.0F, static_cast<float>(GetScreenWidth()) - 24.0F),
                                    std::min(750.0F, static_cast<float>(GetScreenHeight()) - 20.0F));
    const Color accent = factionColor(operative->faction);
    panel(box, accent, 252);
    label("TALLER PRETURNO // CRUD CANONICO", {box.x + 24.0F, box.y + 18.0F}, 23, kAmber);
    label(ellipsis(operative->name, 35) + "  ID " + std::to_string(operative->id),
          {box.x + 24.0F, box.y + 52.0F}, 16, accent);
    label("Se cierra antes del rearme y reclutamiento; cada cambio se valida en el motor.",
          {box.x + 24.0F, box.y + 79.0F}, 12, kMuted);
    DrawLine(static_cast<int>(box.x + 20.0F), static_cast<int>(box.y + 105.0F),
             static_cast<int>(box.x + box.width - 20.0F), static_cast<int>(box.y + 105.0F), kLine);

    const float tabsY = box.y + 116.0F;
    const float tabWidth = (box.width - 56.0F) / 3.0F;
    const std::array<const char*, 3> tabs{"OPERATIVO", "ARMAS FIFO", "ESCUDOS LIFO"};
    const std::array<Color, 3> tabColors{kAmber, kCyan, kMagenta};
    for (int index = 0; index < 3; ++index) {
        if (button({box.x + 20.0F + index * (tabWidth + 4.0F), tabsY, tabWidth, 39.0F},
                   tabs[static_cast<std::size_t>(index)], true,
                   workshopTab == index ? tabColors[static_cast<std::size_t>(index)] : kMuted, 14)) {
            workshopTab = index;
            workshopItem = 0;
            activeField = 0;
            errorMessage.clear();
            syncWorkshopFields();
        }
    }

    const float contentY = box.y + 174.0F;
    const float left = box.x + 24.0F;
    const float right = box.x + box.width * 0.55F;
    auto numericEdit = [&](const char* caption, std::string& field, const int fieldId,
                           const EditKind kind, const float y, const int itemIndex = 0,
                           const bool idRange = false) {
        label(caption, {left, y + 10.0F}, 14, kMuted);
        textField({left + 128.0F, y, 150.0F, 39.0F}, field, fieldId, true,
                  idRange ? 3 : 7, "0", !idRange);
        int parsed = 0;
        bool valid = parseInteger(field, parsed);
        if (idRange) valid = valid && parsed >= 1 && parsed <= 999 &&
                              parsed != selectedOperative && !engine.tree().contains(parsed);
        if (button({left + 290.0F, y, 116.0F, 39.0F}, "APLICAR", valid, kCyan, 12)) {
            EditCommand command;
            command.kind = kind;
            command.value = parsed;
            command.itemIndex = itemIndex;
            applyWorkshop(std::move(command));
            operative = selected();
        }
    };
    auto textEdit = [&](const char* caption, std::string& field, const int fieldId,
                        const EditKind kind, const float y, const int itemIndex = 0) {
        label(caption, {left, y + 10.0F}, 14, kMuted);
        textField({left + 128.0F, y, 260.0F, 39.0F}, field, fieldId, false, 64, "Nombre");
        if (button({left + 400.0F, y, 104.0F, 39.0F}, "APLICAR", !field.empty(), kCyan, 12)) {
            EditCommand command;
            command.kind = kind;
            command.itemIndex = itemIndex;
            command.text = field;
            applyWorkshop(std::move(command));
            operative = selected();
        }
    };

    if (workshopTab == 0) {
        float y = contentY;
        label("IDENTIDAD Y ESTADISTICAS", {left, y}, 17, kCyan);
        y += 31.0F;
        textEdit("NOMBRE", workshopName, 410, EditKind::SetName, y);
        y += 49.0F;
        numericEdit("HP", workshopHp, 401, EditKind::SetHealth, y);
        y += 49.0F;
        numericEdit("ATAQUE", workshopAttack, 402, EditKind::SetAttack, y);
        y += 49.0F;
        numericEdit("RAPIDEZ", workshopSpeed, 403, EditKind::SetSpeed, y);
        y += 49.0F;
        numericEdit("CAMBIAR ID", workshopId, 404, EditKind::ChangeId, y, 0, true);
        y += 55.0F;
        if (button({left, y, 244.0F, 42.0F},
                   "FACCION " + std::string(factionMarker(operative->faction)) + " -> " +
                       factionMarker(opposingFaction(operative->faction)), true, kMagenta, 13)) {
            EditCommand command;
            command.kind = EditKind::ToggleFaction;
            applyWorkshop(std::move(command));
            operative = selected();
        }
        if (button({left + 256.0F, y, 248.0F, 42.0F},
                   operative->isHero ? "QUITAR ESTATUS HEROE" : "CONVERTIR EN HEROE",
                   true, kAmber, 13)) {
            EditCommand command;
            command.kind = EditKind::ToggleHero;
            applyWorkshop(std::move(command));
            operative = selected();
        }

        y = contentY;
        label("COPIAR MOLDE (PRESERVA ID/EQUIPO)", {right, y}, 17, kAmber);
        y += 38.0F;
        if (button({right, y, 180.0F, 38.0F}, "ESPECIES", true,
                   workshopTemplateKind == TemplateKind::Species ? kCyan : kMuted, 13)) {
            workshopTemplateKind = TemplateKind::Species;
            workshopTemplate = 0;
        }
        if (button({right + 190.0F, y, 180.0F, 38.0F}, "PERSONAJES", true,
                   workshopTemplateKind == TemplateKind::Character ? kMagenta : kMuted, 13)) {
            workshopTemplateKind = TemplateKind::Character;
            workshopTemplate = 0;
        }
        y += 53.0F;
        const auto& templates = workshopTemplateKind == TemplateKind::Species
                                    ? engine.catalogs().species() : engine.catalogs().characters();
        if (!templates.empty()) {
            workshopTemplate = std::clamp(workshopTemplate, 0,
                                           static_cast<int>(templates.size()) - 1);
            const UnitTemplate& source = templates[static_cast<std::size_t>(workshopTemplate)];
            selector({right, y, box.x + box.width - 24.0F - right, 46.0F}, source.name,
                     workshopTemplate, static_cast<int>(templates.size()), kAmber);
            y += 62.0F;
            panel({right, y, box.x + box.width - 24.0F - right, 126.0F}, kAmber, 215);
            label("HP " + std::to_string(source.health) + "  ATQ " +
                      std::to_string(source.fortitude > 0 ? source.fortitude : source.damage) +
                      "  RAP " + std::to_string(source.speed),
                  {right + 14.0F, y + 17.0F}, 15, kText);
            wrapped("Copia nombre, fortaleza/dano, HP y rapidez como el CRUD original. "
                    "La faccion, el estatus de heroe y las estructuras de equipo se conservan.",
                    {right + 14.0F, y + 49.0F, box.x + box.width - right - 52.0F, 65.0F},
                    12, kMuted, 4.0F);
            y += 142.0F;
            if (button({right, y, box.x + box.width - 24.0F - right, 42.0F},
                       "APLICAR MOLDE", true, kAmber, 14)) {
                EditCommand command;
                command.kind = EditKind::ApplyTemplate;
                command.catalogIndex = workshopTemplate;
                command.templateKind = workshopTemplateKind;
                applyWorkshop(std::move(command));
                operative = selected();
            }
        }
    } else if (workshopTab == 1) {
        float y = contentY;
        label("EDITAR CUALQUIER ARMA (ORDEN FIFO INTACTO)", {left, y}, 17, kCyan);
        y += 34.0F;
        if (operative->weapons.empty()) {
            panel({left, y, 504.0F, 80.0F}, kRed, 210);
            centered("ARSENAL VACIO", {left, y, 504.0F, 80.0F}, 16, kRed);
        } else {
            workshopItem = std::clamp(workshopItem, 0,
                                      static_cast<int>(operative->weapons.size()) - 1);
            const int previous = workshopItem;
            const Weapon& weapon = operative->weapons[static_cast<std::size_t>(workshopItem)];
            selector({left, y, 504.0F, 44.0F},
                     std::string(workshopItem == 0 ? "FRENTE > " : "COLA > ") + weapon.name,
                     workshopItem, static_cast<int>(operative->weapons.size()), kCyan);
            if (workshopItem != previous) syncWorkshopFields();
            y += 57.0F;
            textEdit("NOMBRE", workshopItemName, 421, EditKind::SetWeaponName, y, workshopItem);
            y += 48.0F;
            numericEdit("ID INTERNO", workshopItemId, 422, EditKind::SetWeaponId, y, workshopItem);
            y += 48.0F;
            numericEdit("DANO", workshopValueA, 423, EditKind::SetWeaponDamage, y, workshopItem);
            y += 48.0F;
            numericEdit("MUNICION", workshopValueB, 424, EditKind::SetWeaponAmmo, y, workshopItem);
            y += 48.0F;
            numericEdit("COSTO USO", workshopValueC, 425, EditKind::SetWeaponUseCost, y, workshopItem);
            y += 55.0F;
            if (button({left, y, 504.0F, 40.0F}, "ELIMINAR ARMA SELECCIONADA", true, kRed, 13)) {
                EditCommand command;
                command.kind = EditKind::DeleteWeapon;
                command.itemIndex = workshopItem;
                applyWorkshop(std::move(command));
                operative = selected();
            }
        }

        y = contentY;
        label("CATALOGO / PRIMITIVAS FIFO", {right, y}, 17, kCyan);
        y += 39.0F;
        const auto& weapons = engine.catalogs().weapons();
        if (!weapons.empty()) {
            workshopWeapon = std::clamp(workshopWeapon, 0, static_cast<int>(weapons.size()) - 1);
            selector({right, y, box.x + box.width - 24.0F - right, 44.0F},
                     weapons[static_cast<std::size_t>(workshopWeapon)].name, workshopWeapon,
                     static_cast<int>(weapons.size()), kCyan);
            y += 59.0F;
            const int catalogId = weapons[static_cast<std::size_t>(workshopWeapon)].id;
            const bool unique = std::none_of(operative->weapons.begin(), operative->weapons.end(),
                                             [&](const Weapon& current) { return current.id == catalogId; });
            if (button({right, y, box.x + box.width - 24.0F - right, 42.0F},
                       unique ? "ENCOLAR AL FINAL" : "ID YA PRESENTE", unique, kCyan, 13)) {
                EditCommand command;
                command.kind = EditKind::AddWeapon;
                command.catalogIndex = workshopWeapon;
                applyWorkshop(std::move(command));
                operative = selected();
            }
            y += 56.0F;
        }
        if (button({right, y, box.x + box.width - 24.0F - right, 42.0F},
                   "POP FRENTE ACTIVO", operative->activeWeapon() != nullptr, kRed, 13)) {
            EditCommand command;
            command.kind = EditKind::RemoveActiveWeapon;
            applyWorkshop(std::move(command));
            operative = selected();
        }
        y += 64.0F;
        wrapped("Seleccionar o editar un elemento interno no reordena la cola. El arma activa "
                "siempre es la posicion FRENTE; eliminar otra conserva el orden restante.",
                {right, y, box.x + box.width - 28.0F - right, 105.0F}, 13, kMuted, 5.0F);
    } else {
        float y = contentY;
        label("EDITAR CUALQUIER ESCUDO (ORDEN LIFO INTACTO)", {left, y}, 17, kMagenta);
        y += 34.0F;
        if (operative->shields.empty()) {
            panel({left, y, 504.0F, 80.0F}, kRed, 210);
            centered("PILA VACIA", {left, y, 504.0F, 80.0F}, 16, kRed);
        } else {
            workshopItem = std::clamp(workshopItem, 0,
                                      static_cast<int>(operative->shields.size()) - 1);
            const int previous = workshopItem;
            const Shield& shield = operative->shields[static_cast<std::size_t>(workshopItem)];
            const bool top = workshopItem == static_cast<int>(operative->shields.size()) - 1;
            selector({left, y, 504.0F, 44.0F},
                     std::string(top ? "TOPE > " : "PILA > ") + shield.name,
                     workshopItem, static_cast<int>(operative->shields.size()), kMagenta);
            if (workshopItem != previous) syncWorkshopFields();
            y += 57.0F;
            textEdit("NOMBRE", workshopItemName, 431, EditKind::SetShieldName, y, workshopItem);
            y += 48.0F;
            numericEdit("ID INTERNO", workshopItemId, 432, EditKind::SetShieldId, y, workshopItem);
            y += 48.0F;
            numericEdit("ABSORCION", workshopValueA, 433, EditKind::SetShieldAbsorption, y, workshopItem);
            y += 48.0F;
            numericEdit("DURABILIDAD", workshopValueB, 434, EditKind::SetShieldDurability, y, workshopItem);
            y += 48.0F;
            numericEdit("PESO", workshopValueC, 435, EditKind::SetShieldWeight, y, workshopItem);
            y += 55.0F;
            if (button({left, y, 504.0F, 40.0F}, "ELIMINAR ESCUDO SELECCIONADO", true, kRed, 13)) {
                EditCommand command;
                command.kind = EditKind::DeleteShield;
                command.itemIndex = workshopItem;
                applyWorkshop(std::move(command));
                operative = selected();
            }
        }

        y = contentY;
        label("CATALOGO / PRIMITIVAS LIFO", {right, y}, 17, kMagenta);
        y += 39.0F;
        const auto& shields = engine.catalogs().shields();
        if (!shields.empty()) {
            workshopShield = std::clamp(workshopShield, 0, static_cast<int>(shields.size()) - 1);
            selector({right, y, box.x + box.width - 24.0F - right, 44.0F},
                     shields[static_cast<std::size_t>(workshopShield)].name, workshopShield,
                     static_cast<int>(shields.size()), kMagenta);
            y += 59.0F;
            const int catalogId = shields[static_cast<std::size_t>(workshopShield)].id;
            const bool unique = std::none_of(operative->shields.begin(), operative->shields.end(),
                                             [&](const Shield& current) { return current.id == catalogId; });
            if (button({right, y, box.x + box.width - 24.0F - right, 42.0F},
                       unique ? "APILAR EN EL TOPE" : "ID YA PRESENTE", unique, kMagenta, 13)) {
                EditCommand command;
                command.kind = EditKind::AddShield;
                command.catalogIndex = workshopShield;
                applyWorkshop(std::move(command));
                operative = selected();
            }
            y += 56.0F;
        }
        if (button({right, y, box.x + box.width - 24.0F - right, 42.0F},
                   "POP TOPE ACTIVO", operative->activeShield() != nullptr, kRed, 13)) {
            EditCommand command;
            command.kind = EditKind::RemoveActiveShield;
            applyWorkshop(std::move(command));
            operative = selected();
        }
        y += 64.0F;
        wrapped("Seleccionar o editar un escudo interno no reordena la pila. El escudo activo "
                "siempre es el TOPE; eliminar otro conserva el orden restante.",
                {right, y, box.x + box.width - 28.0F - right, 105.0F}, 13, kMuted, 5.0F);
    }

    if (!errorMessage.empty()) label(ellipsis(errorMessage, 86), {box.x + 24.0F, box.y + box.height - 92.0F}, 12, kRed);
    const float footer = box.y + box.height - 62.0F;
    if (button({box.x + box.width - 184.0F, footer, 160.0F, 40.0F}, "CERRAR", true, kGreen, 14) ||
        IsKeyPressed(KEY_ESCAPE)) {
        modal = Modal::None;
        deleteArmed = false;
        errorMessage.clear();
    }
    if (button({box.x + 24.0F, footer, 230.0F, 40.0F},
               deleteArmed ? "CONFIRMAR ELIMINACION" : "ELIMINAR OPERATIVO",
               true, kRed, 13)) {
        if (deleteArmed) {
            EditCommand command;
            command.kind = EditKind::DeleteOperative;
            applyWorkshop(std::move(command));
        } else deleteArmed = true;
    }
    if (deleteArmed) label("Haz clic otra vez: la clave sera borrada y el B-4 se reequilibrara.",
                           {box.x + 270.0F, footer + 13.0F}, 11, kRed);
}

void GameApp::Impl::drawHelpModal() {
    drawModalShade();
    const Rectangle box = modalRect(760.0F, 560.0F);
    panel(box, kAmber, 252);
    label("CONTROL DE LA RED", {box.x + 24.0F, box.y + 20.0F}, 24, kAmber);
    const std::array<std::pair<const char*, const char*>, 9> controls{{
        {"ESPACIO", "Continuar / acelerar el siguiente pulso"},
        {"E", "Avanzar exactamente un evento o paso del motor"},
        {"P", "Pausar o reanudar la visualizacion"},
        {"T", "IA vs IA: avanzar hasta el siguiente turno"},
        {"C", "Centrar y encajar el Arbol B-4"},
        {"I", "Mostrar u ocultar el inspector tactico"},
        {"W", "Abrir Taller durante el preturno con una unidad seleccionada"},
        {"RUEDA / +/-", "Zoom; boton medio/derecho o WASD desplazan"},
        {"F11", "Alternar pantalla completa"},
    }};
    float y = box.y + 72.0F;
    for (const auto& [key, description] : controls) {
        DrawRectangleRounded({box.x + 24.0F, y, 126.0F, 34.0F}, 0.12F, 4, Color{34, 45, 58, 225});
        centered(key, {box.x + 24.0F, y, 126.0F, 34.0F}, 13, kCyan);
        label(description, {box.x + 170.0F, y + 9.0F}, 14, kText);
        y += 45.0F;
    }
    label("Seleccion: clic izquierdo sobre un slot. Las formas y letras distinguen N/NEON de O/OMEGA.",
          {box.x + 24.0F, box.y + box.height - 76.0F}, 12, kMuted);
    if (button({box.x + box.width - 178.0F, box.y + box.height - 58.0F, 154.0F, 38.0F},
               "CERRAR [ESC]", true, kGreen, 13) || IsKeyPressed(KEY_ESCAPE)) {
        modal = Modal::None;
    }
}

void GameApp::Impl::drawVictory() {
    drawBackground(0.48F);
    const VictorySummary& result = engine.victory();
    const GameSnapshot snapshot = engine.snapshot();
    const float width = static_cast<float>(GetScreenWidth());
    const float height = static_cast<float>(GetScreenHeight());
    const Color winnerColor = result.winner == Faction::Neutral ? kAmber : factionColor(result.winner);
    const std::string winner = result.winner == Faction::Neutral
                                   ? "EMPATE EN LA RED"
                                   : std::string(factionName(result.winner)) + " CONTROLA YGGDRASIL";
    centered("OPERACION CONCLUIDA", {0.0F, 16.0F, width, 42.0F}, 19, kMuted);
    centered(winner, {0.0F, 52.0F, width, 56.0F}, 32, winnerColor);
    centered(victoryReasonName(result.reason), {0.0F, 107.0F, width, 32.0F}, 17, kText);

    const float cardY = 152.0F;
    const float margin = 24.0F;
    const float gap = 9.0F;
    const float statWidth = (width - margin * 2.0F - gap * 7.0F) / 8.0F;
    struct ResultStat { const char* title; std::string value; Color color; };
    const std::array<ResultStat, 8> stats{{
        {"NEON VIVOS", std::to_string(result.neonSurvivors), kCyan},
        {"OMEGA VIVOS", std::to_string(result.omegaSurvivors), kMagenta},
        {"BAJAS N", std::to_string(result.statistics.neonCasualties), kCyan},
        {"BAJAS O", std::to_string(result.statistics.omegaCasualties), kMagenta},
        {"CONVERSIONES", std::to_string(result.statistics.conversions), kGreen},
        {"DISRUPCIONES", std::to_string(result.statistics.disruptions), kAmber},
        {"TURNOS", std::to_string(result.turnsPlayed), kText},
        {"INSERCIONES", std::to_string(result.totalInsertions), kText},
    }};
    for (int index = 0; index < 8; ++index) {
        const Rectangle card{margin + index * (statWidth + gap), cardY, statWidth, 65.0F};
        panel(card, stats[static_cast<std::size_t>(index)].color, 226);
        centered(stats[static_cast<std::size_t>(index)].title, {card.x, card.y + 7.0F, card.width, 18.0F},
                 10, kMuted);
        centered(stats[static_cast<std::size_t>(index)].value, {card.x, card.y + 26.0F, card.width, 32.0F},
                 21, stats[static_cast<std::size_t>(index)].color);
    }
    centered("SEMILLA " + std::to_string(result.seed), {0.0F, 224.0F, width, 24.0F}, 13, kMuted);

    treeViewport = {24.0F, 258.0F, width - 48.0F, std::max(180.0F, height - 340.0F)};
    camera.offset = {treeViewport.x + treeViewport.width * 0.5F,
                     treeViewport.y + treeViewport.height * 0.5F};
    rebuildTreeLayout();
    if (cameraNeedsCenter) centerCamera();
    DrawRectangleRec(treeViewport, Color{3, 8, 24, 155});
    DrawRectangleLinesEx(treeViewport, 1.0F, withAlpha(winnerColor, 110));
    drawTree(false);
    label("ARBOL FINAL AUTENTICO // " + std::to_string(snapshot.tree.size) + " CLAVES // ALTURA " +
              std::to_string(snapshot.tree.height),
          {treeViewport.x + 12.0F, treeViewport.y + 10.0F}, 12, kMuted);

    const float buttonY = height - 66.0F;
    const float buttonWidth = std::min(250.0F, (width - 72.0F) / 3.0F);
    const float buttonsX = (width - buttonWidth * 3.0F - 24.0F) * 0.5F;
    if (button({buttonsX, buttonY, buttonWidth, 44.0F}, "REVANCHA: MISMA SEMILLA", true, winnerColor, 14)) {
        seedText = std::to_string(result.seed);
        beginGame(config.mode);
    }
    if (button({buttonsX + buttonWidth + 12.0F, buttonY, buttonWidth, 44.0F}, "NUEVA SEMILLA", true, kGreen, 14)) {
        const std::uint64_t generated = (static_cast<std::uint64_t>(GetRandomValue(1, 0x7fffffff)) << 32U) ^
                                        static_cast<std::uint64_t>(GetRandomValue(1, 0x7fffffff)) ^
                                        static_cast<std::uint64_t>(GetTime() * 1'000'000.0);
        seedText = std::to_string(generated);
        beginGame(config.mode);
    }
    if (button({buttonsX + (buttonWidth + 12.0F) * 2.0F, buttonY, buttonWidth, 44.0F},
               "MENU PRINCIPAL", true, kMuted, 14)) {
        screen = Screen::MainMenu;
        visibleEvents.clear();
        effects.clear();
    }
}

} // namespace yggdrasil::ui
