#pragma once

#include <deque>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace yggdrasil {

// The numeric values deliberately match the canonical console implementation.
enum class Faction : int {
    Neutral = 0,
    Neon = 1,
    Omega = 2,
};

[[nodiscard]] constexpr std::string_view factionName(const Faction faction) noexcept {
    switch (faction) {
    case Faction::Neon: return "NEON";
    case Faction::Omega: return "OMEGA";
    case Faction::Neutral: return "NEUTRAL";
    }
    return "NEUTRAL";
}

[[nodiscard]] constexpr Faction opposingFaction(const Faction faction) noexcept {
    switch (faction) {
    case Faction::Neon: return Faction::Omega;
    case Faction::Omega: return Faction::Neon;
    case Faction::Neutral: return Faction::Neutral;
    }
    return Faction::Neutral;
}

// Modern value equivalent of the canonical NodoEscudo. Operative::shields is
// a LIFO stack: the active shield is always shields.back().
struct Shield {
    int id{0};
    std::string name;
    std::string type;
    int absorption{0};
    int durability{0};
    int weight{0};

    friend bool operator==(const Shield&, const Shield&) = default;
};

// Modern value equivalent of the canonical NodoMunicion. Operative::weapons
// is a FIFO arsenal: the active weapon is always weapons.front().
struct Weapon {
    int id{0};
    std::string name;
    std::string blastType;
    int damage{0};
    int ammunition{0};
    int useCost{0};

    friend bool operator==(const Weapon&, const Weapon&) = default;
};

// All fields from the canonical Operativo are retained. `health` is the
// stamped/template health (`salud`); `baseHp` is the mutable combat HP
// (`hp_base`). `attack` remains the collapsed strength/damage combat stat.
struct Operative {
    int id{0};
    std::string name;
    Faction faction{Faction::Neutral};
    int classType{0};

    int strength{0};
    int damage{0};
    int health{0};
    int speed{0};
    int baseHp{0};
    int attack{0};
    bool isHero{false};
    bool recentlyConverted{false};

    std::vector<Shield> shields;
    std::deque<Weapon> weapons;

    Operative() = default;

    Operative(
        const int operativeId,
        std::string operativeName,
        const Faction operativeFaction,
        const int hp,
        const int operativeClass,
        const int operativeStrength,
        const int operativeDamage,
        const int operativeSpeed,
        const bool hero = false)
        : id(operativeId),
          name(std::move(operativeName)),
          faction(operativeFaction),
          classType(operativeClass),
          strength(operativeStrength),
          damage(operativeDamage),
          health(hp),
          speed(operativeSpeed),
          baseHp(hp),
          attack(operativeStrength > 0 ? operativeStrength : operativeDamage),
          isHero(hero) {}

    [[nodiscard]] bool alive() const noexcept { return baseHp > 0; }

    [[nodiscard]] Shield* activeShield() noexcept {
        return shields.empty() ? nullptr : &shields.back();
    }

    [[nodiscard]] const Shield* activeShield() const noexcept {
        return shields.empty() ? nullptr : &shields.back();
    }

    [[nodiscard]] Weapon* activeWeapon() noexcept {
        return weapons.empty() ? nullptr : &weapons.front();
    }

    [[nodiscard]] const Weapon* activeWeapon() const noexcept {
        return weapons.empty() ? nullptr : &weapons.front();
    }

    void pushShield(Shield shield) { shields.push_back(std::move(shield)); }
    void popShield() {
        if (!shields.empty()) {
            shields.pop_back();
        }
    }

    void enqueueWeapon(Weapon weapon) { weapons.push_back(std::move(weapon)); }
    void popWeapon() {
        if (!weapons.empty()) {
            weapons.pop_front();
        }
    }

    friend bool operator==(const Operative&, const Operative&) = default;
};

} // namespace yggdrasil
