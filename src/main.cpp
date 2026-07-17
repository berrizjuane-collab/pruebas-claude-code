#include "yggdrasil/ui/game_app.hpp"

#include <filesystem>
#include <iostream>
#include <string_view>

namespace {

void printUsage(const char* executable) {
    std::cout << "Uso: " << executable
              << " [--data-dir RUTA] [--smoke-test] [--screenshot ARCHIVO.png]\n";
}

} // namespace

int main(const int argc, char** argv) {
    yggdrasil::ui::AppOptions options;
    if (argc > 0 && argv[0] != nullptr) options.executablePath = argv[0];

    for (int index = 1; index < argc; ++index) {
        const std::string_view argument = argv[index];
        if (argument == "--data-dir") {
            if (++index >= argc) {
                std::cerr << "Falta la ruta despues de --data-dir.\n";
                return 2;
            }
            options.dataDirectory = std::filesystem::path(argv[index]);
        } else if (argument == "--smoke-test") {
            options.smokeTest = true;
        } else if (argument == "--screenshot") {
            if (++index >= argc) {
                std::cerr << "Falta el archivo despues de --screenshot.\n";
                return 2;
            }
            options.screenshotPath = std::filesystem::path(argv[index]);
        } else if (argument == "--help" || argument == "-h") {
            printUsage(argc > 0 ? argv[0] : "yggdrasil_game");
            return 0;
        } else {
            std::cerr << "Opcion desconocida: " << argument << '\n';
            printUsage(argc > 0 ? argv[0] : "yggdrasil_game");
            return 2;
        }
    }

    yggdrasil::ui::GameApp app(std::move(options));
    return app.run();
}
