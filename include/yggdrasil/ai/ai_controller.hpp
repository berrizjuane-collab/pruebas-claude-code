#pragma once

#include "yggdrasil/core/game_engine.hpp"

#include <cstddef>
#include <string>

namespace yggdrasil {

// Resolves the exact same PendingDecision objects used by the manual UI. All
// ties are broken through GameEngine::randomInt, so a game seed fully
// determines the AI's choices as well as the combat simulation.
class AIController {
public:
    [[nodiscard]] bool resolve(GameEngine& engine, std::string* error = nullptr);

    // Drives an already-started game until victory. The cycle limit protects
    // command-line tools and tests from a stalled engine/API integration.
    [[nodiscard]] bool runHeadless(GameEngine& engine,
                                   std::size_t maxCycles = 100'000,
                                   std::string* error = nullptr);

    [[nodiscard]] const std::string& lastExplanation() const noexcept {
        return lastExplanation_;
    }

private:
    std::string lastExplanation_;
};

// Friendly spelling for callers that follow the project's `AiVsAi` casing.
using AiController = AIController;

} // namespace yggdrasil
