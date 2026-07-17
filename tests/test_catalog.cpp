#include "yggdrasil/core/catalog.hpp"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>

namespace {

using yggdrasil::Catalog;

void require(bool condition, std::string_view message) {
  if (!condition) {
    throw std::runtime_error(std::string(message));
  }
}

class TemporaryDirectory {
 public:
  TemporaryDirectory() {
    const auto suffix = std::chrono::high_resolution_clock::now().time_since_epoch().count();
    path_ = std::filesystem::temp_directory_path() /
            ("yggdrasil-catalog-test-" + std::to_string(suffix));
    require(std::filesystem::create_directories(path_),
            "could not create temporary fixture directory");
  }

  ~TemporaryDirectory() {
    std::error_code ignored;
    std::filesystem::remove_all(path_, ignored);
  }

  TemporaryDirectory(const TemporaryDirectory&) = delete;
  TemporaryDirectory& operator=(const TemporaryDirectory&) = delete;

  [[nodiscard]] const std::filesystem::path& path() const noexcept { return path_; }

 private:
  std::filesystem::path path_;
};

void write_file(const std::filesystem::path& path, std::string_view contents) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  require(static_cast<bool>(output), "could not open fixture file");
  output.write(contents.data(), static_cast<std::streamsize>(contents.size()));
  require(static_cast<bool>(output), "could not write fixture file");
}

void write_valid_catalogs(const std::filesystem::path& directory) {
  write_file(directory / "armas.txt",
             "1\r\n"
             "  ---  \r\n"
             "+7\r\n"
             "  Cañón de prueba  \r\n"
             " Precision \r\n"
             "250 # damage\r\n"
             "50\r\n"
             "120\r\n");

  write_file(directory / "escudos.txt",
             "1\n"
             "---\n"
             "9\n"
             " Escudo de prueba \n"
             " Personal \n"
             "150\n"
             "200 # durability\n"
             "10\n"
             "---\n");

  write_file(directory / "especie.txt",
             "1\n"
             "---\n"
             "1\n"
             " Humano \n"
             "120 # Fortaleza\n"
             "-\n"
             "70 # Salud\n"
             "60 # Rapidez\n");

  write_file(directory / "personajes.txt",
             "1\n"
             "---\n"
             "4\n"
             "Dron Centinela\n"
             "-\n"
             "120 # Danio\n"
             "60\n"
             "130\n");

  write_file(directory / "heroes.txt",
             "1\n"
             "---\n"
             "2\n"
             "Fantasma Null Pointer\n"
             "150\n"
             "-\n"
             "120\n"
             "180\n");
}

void test_successful_load_and_lookups(const std::filesystem::path& data) {
  write_valid_catalogs(data);

  Catalog catalog;
  require(catalog.load(data), "valid fixture must load");
  require(catalog.loaded(), "loaded flag must be true after complete load");
  require(catalog.diagnostics().empty(), "valid fixture must not produce diagnostics");
  require(catalog.weapons().size() == 1, "weapon count mismatch");
  require(catalog.shields().size() == 1, "shield count mismatch");
  require(catalog.species().size() == 1, "species count mismatch");
  require(catalog.characters().size() == 1, "character count mismatch");
  require(catalog.heroes().size() == 1, "hero count mismatch");

  const auto* weapon = catalog.weapon_by_id(7);
  require(weapon != nullptr, "weapon lookup by id failed");
  require(weapon->name == "Cañón de prueba", "UTF-8 text or surrounding whitespace changed");
  require(weapon->damage == 250 && weapon->ammunition == 50 && weapon->use_cost == 120,
          "weapon stats mismatch");
  require(catalog.weapon_by_name("Cañón de prueba") == weapon,
          "UTF-8 weapon lookup by name failed");
  require(catalog.weapon_by_id(999) == nullptr, "missing weapon lookup must return null");

  const auto* shield = catalog.shield_by_name("Escudo de prueba");
  require(shield != nullptr && shield->durability == 200,
          "shield comment parsing or lookup failed");

  const auto* species = catalog.species_by_id(1);
  require(species != nullptr, "species lookup failed");
  require(species->fortitude == 120 && species->damage == 0 && species->health == 70 &&
              species->speed == 60,
          "entity stat/comment/dash parsing failed");
  require(catalog.character_by_name("Dron Centinela") != nullptr,
          "character lookup by name failed");
  require(catalog.hero_by_id(2) != nullptr, "hero lookup by id failed");

  std::error_code error;
  const auto expected = std::filesystem::weakly_canonical(data, error);
  require(!error && catalog.data_directory() == expected,
          "catalog must expose the resolved data directory");
}

void test_directory_locator(const std::filesystem::path& root) {
  const auto explicit_data = root / "explicit";
  const auto executable = root / "bundle" / "bin";
  const auto sibling_data = root / "bundle" / "data";
  const auto working = root / "working";
  const auto cwd_data = working / "data";
  std::filesystem::create_directories(explicit_data);
  std::filesystem::create_directories(executable);
  std::filesystem::create_directories(sibling_data);
  std::filesystem::create_directories(cwd_data);

  auto located = Catalog::locate_data_directory(explicit_data, executable, working);
  require(located && *located == std::filesystem::weakly_canonical(explicit_data),
          "explicit directory must have first priority");

  located = Catalog::locate_data_directory({}, executable, root / "missing-working");
  require(located && *located == std::filesystem::weakly_canonical(sibling_data),
          "executable_dir/../data fallback failed");

  located = Catalog::locate_data_directory({}, {}, working);
  require(located && *located == std::filesystem::weakly_canonical(cwd_data),
          "working_directory/data fallback failed");
}

void test_catalog_type_is_transactional(const std::filesystem::path& data) {
  write_valid_catalogs(data);
  write_file(data / "armas.txt",
             "2\n"
             "---\n"
             "1\n"
             "Valid first block\n"
             "Direct\n"
             "100\n"
             "50\n"
             "10\n"
             "---\n"
             "2\n"
             "Corrupt second block\n"
             "Direct\n"
             "not-a-number\n"
             "50\n"
             "10\n");

  Catalog catalog;
  require(!catalog.load(data), "corrupt weapon catalog must fail the aggregate load");
  require(!catalog.loaded(), "loaded flag must be false after a partial failure");
  require(catalog.weapons().empty(), "a corrupt type must not expose a partial prefix");
  require(catalog.shields().size() == 1 && catalog.species().size() == 1 &&
              catalog.characters().size() == 1 && catalog.heroes().size() == 1,
          "one corrupt type must not discard independently valid catalogs");
  require(catalog.diagnostics().size() == 1 &&
              catalog.diagnostics().front().find("armas.txt") != std::string::npos,
          "corruption must produce a filename-specific diagnostic");
}

void test_count_sanity_limit(const std::filesystem::path& data) {
  write_valid_catalogs(data);
  write_file(data / "heroes.txt", "10001\n---\n");

  Catalog catalog;
  require(!catalog.load(data), "entry count above the sanity limit must fail");
  require(catalog.heroes().empty(), "out-of-range count must leave its catalog empty");
  require(!catalog.diagnostics().empty() &&
              catalog.diagnostics().front().find("10000") != std::string::npos,
          "count failure must explain the limit");
}

}  // namespace

int main() {
  try {
    TemporaryDirectory temporary;
    const auto data = temporary.path() / "fixture-data";
    std::filesystem::create_directories(data);

    test_successful_load_and_lookups(data);
    test_directory_locator(temporary.path());
    test_catalog_type_is_transactional(data);
    test_count_sanity_limit(data);

    std::cout << "catalog tests passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "catalog tests failed: " << error.what() << '\n';
    return 1;
  }
}
