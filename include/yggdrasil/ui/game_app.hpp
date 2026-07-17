#pragma once

#include <filesystem>

namespace yggdrasil::ui {

struct AppOptions {
    std::filesystem::path dataDirectory;
    std::filesystem::path executablePath;
    std::filesystem::path screenshotPath;
    bool smokeTest{false};
};

// Owns the raylib window and the non-blocking graphical game loop.
class GameApp {
public:
    explicit GameApp(AppOptions options = {});
    ~GameApp();

    GameApp(const GameApp&) = delete;
    GameApp& operator=(const GameApp&) = delete;

    [[nodiscard]] int run();

private:
    struct Impl;
    Impl* impl_;
};

} // namespace yggdrasil::ui
