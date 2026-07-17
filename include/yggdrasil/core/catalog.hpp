#pragma once

#include <cstddef>
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace yggdrasil {

inline constexpr std::size_t kMaxCatalogEntries = 10'000;

struct WeaponDefinition {
  int id{};
  std::string name;
  std::string type;
  int damage{};
  int ammunition{};
  int use_cost{};

  friend bool operator==(const WeaponDefinition&, const WeaponDefinition&) = default;
};

struct ShieldDefinition {
  int id{};
  std::string name;
  std::string type;
  int absorption{};
  int durability{};
  int weight{};

  friend bool operator==(const ShieldDefinition&, const ShieldDefinition&) = default;
};

// Species, regular characters, and heroes share the canonical six-line format.
struct UnitTemplate {
  int id{};
  std::string name;
  int fortitude{};
  int damage{};
  int health{};
  int speed{};

  friend bool operator==(const UnitTemplate&, const UnitTemplate&) = default;
};

class Catalog {
 public:
  using Path = std::filesystem::path;

  // Candidates are checked in this order: explicit_directory,
  // executable_directory/data, executable_directory/../data, and
  // working_directory/data. An empty working_directory means current_path().
  [[nodiscard]] static std::optional<Path> locate_data_directory(
      const Path& explicit_directory = {},
      const Path& executable_directory = {},
      const Path& working_directory = {});

  // Loads all five catalog types. Successful types remain available if another
  // type is missing or corrupt; false and diagnostics() report any failure.
  [[nodiscard]] bool load(const Path& explicit_directory = {},
                          const Path& executable_directory = {},
                          const Path& working_directory = {});

  [[nodiscard]] bool loaded() const noexcept { return loaded_; }
  [[nodiscard]] const Path& data_directory() const noexcept { return data_directory_; }
  [[nodiscard]] const std::vector<std::string>& diagnostics() const noexcept {
    return diagnostics_;
  }

  [[nodiscard]] const std::vector<WeaponDefinition>& weapons() const noexcept {
    return weapons_;
  }
  [[nodiscard]] const std::vector<ShieldDefinition>& shields() const noexcept {
    return shields_;
  }
  [[nodiscard]] const std::vector<UnitTemplate>& species() const noexcept {
    return species_;
  }
  [[nodiscard]] const std::vector<UnitTemplate>& characters() const noexcept {
    return characters_;
  }
  [[nodiscard]] const std::vector<UnitTemplate>& heroes() const noexcept {
    return heroes_;
  }

  [[nodiscard]] const WeaponDefinition* weapon_by_id(int id) const noexcept;
  [[nodiscard]] const WeaponDefinition* weapon_by_name(std::string_view name) const noexcept;
  [[nodiscard]] const ShieldDefinition* shield_by_id(int id) const noexcept;
  [[nodiscard]] const ShieldDefinition* shield_by_name(std::string_view name) const noexcept;
  [[nodiscard]] const UnitTemplate* species_by_id(int id) const noexcept;
  [[nodiscard]] const UnitTemplate* species_by_name(std::string_view name) const noexcept;
  [[nodiscard]] const UnitTemplate* character_by_id(int id) const noexcept;
  [[nodiscard]] const UnitTemplate* character_by_name(std::string_view name) const noexcept;
  [[nodiscard]] const UnitTemplate* hero_by_id(int id) const noexcept;
  [[nodiscard]] const UnitTemplate* hero_by_name(std::string_view name) const noexcept;

 private:
  bool loaded_{};
  Path data_directory_;
  std::vector<std::string> diagnostics_;
  std::vector<WeaponDefinition> weapons_;
  std::vector<ShieldDefinition> shields_;
  std::vector<UnitTemplate> species_;
  std::vector<UnitTemplate> characters_;
  std::vector<UnitTemplate> heroes_;
};

}  // namespace yggdrasil
