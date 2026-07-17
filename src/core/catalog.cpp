#include "yggdrasil/core/catalog.hpp"

#include <algorithm>
#include <charconv>
#include <cstdint>
#include <fstream>
#include <string>
#include <system_error>
#include <unordered_set>
#include <utility>

namespace yggdrasil {
namespace {

struct SourceLine {
  std::size_t number{};
  std::string text;
};

[[nodiscard]] bool ascii_space(char value) noexcept {
  return value == ' ' || value == '\t' || value == '\r' || value == '\n' ||
         value == '\f' || value == '\v';
}

[[nodiscard]] std::string_view trim(std::string_view value) noexcept {
  while (!value.empty() && ascii_space(value.front())) {
    value.remove_prefix(1);
  }
  while (!value.empty() && ascii_space(value.back())) {
    value.remove_suffix(1);
  }
  return value;
}

[[nodiscard]] bool continuation(std::uint8_t value) noexcept {
  return (value & 0xc0U) == 0x80U;
}

// The game stores names as UTF-8 bytes. Validate them without transcoding so
// accents remain byte-for-byte usable by the renderer and lookup API.
[[nodiscard]] bool valid_utf8(std::string_view value) noexcept {
  std::size_t index = 0;
  while (index < value.size()) {
    const auto first = static_cast<std::uint8_t>(value[index]);
    if (first <= 0x7fU) {
      ++index;
      continue;
    }

    if (first >= 0xc2U && first <= 0xdfU) {
      if (index + 1 >= value.size() ||
          !continuation(static_cast<std::uint8_t>(value[index + 1]))) {
        return false;
      }
      index += 2;
      continue;
    }

    if (first >= 0xe0U && first <= 0xefU) {
      if (index + 2 >= value.size()) {
        return false;
      }
      const auto second = static_cast<std::uint8_t>(value[index + 1]);
      const auto third = static_cast<std::uint8_t>(value[index + 2]);
      if (!continuation(third)) {
        return false;
      }
      if (first == 0xe0U) {
        if (second < 0xa0U || second > 0xbfU) {
          return false;  // Overlong encoding.
        }
      } else if (first == 0xedU) {
        if (second < 0x80U || second > 0x9fU) {
          return false;  // UTF-16 surrogate range.
        }
      } else if (!continuation(second)) {
        return false;
      }
      index += 3;
      continue;
    }

    if (first >= 0xf0U && first <= 0xf4U) {
      if (index + 3 >= value.size()) {
        return false;
      }
      const auto second = static_cast<std::uint8_t>(value[index + 1]);
      const auto third = static_cast<std::uint8_t>(value[index + 2]);
      const auto fourth = static_cast<std::uint8_t>(value[index + 3]);
      if (!continuation(third) || !continuation(fourth)) {
        return false;
      }
      if (first == 0xf0U) {
        if (second < 0x90U || second > 0xbfU) {
          return false;  // Overlong encoding.
        }
      } else if (first == 0xf4U) {
        if (second < 0x80U || second > 0x8fU) {
          return false;  // Above U+10FFFF.
        }
      } else if (!continuation(second)) {
        return false;
      }
      index += 4;
      continue;
    }

    return false;
  }
  return true;
}

[[nodiscard]] std::string file_label(const std::filesystem::path& path) {
  const auto filename = path.filename().string();
  return filename.empty() ? path.string() : filename;
}

[[nodiscard]] bool read_lines(const std::filesystem::path& path,
                              std::vector<SourceLine>& lines,
                              std::string& diagnostic) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    diagnostic = file_label(path) + ": unable to open catalog file";
    return false;
  }

  std::string line;
  std::size_t line_number = 0;
  while (std::getline(input, line)) {
    ++line_number;
    if (line_number == 1 && line.size() >= 3 &&
        static_cast<std::uint8_t>(line[0]) == 0xefU &&
        static_cast<std::uint8_t>(line[1]) == 0xbbU &&
        static_cast<std::uint8_t>(line[2]) == 0xbfU) {
      line.erase(0, 3);
    }
    if (!valid_utf8(line)) {
      diagnostic = file_label(path) + ":" + std::to_string(line_number) +
                   ": invalid UTF-8";
      return false;
    }
    lines.push_back(SourceLine{line_number, std::move(line)});
  }

  if (input.bad()) {
    diagnostic = file_label(path) + ": I/O error while reading catalog file";
    return false;
  }
  return true;
}

enum class IntegerStyle {
  Strict,
  Stat,
};

[[nodiscard]] bool parse_integer(std::string_view text, IntegerStyle style,
                                 int& result) noexcept {
  text = trim(text);
  if (style == IntegerStyle::Stat) {
    if (const auto comment = text.find('#'); comment != std::string_view::npos) {
      text = trim(text.substr(0, comment));
    }
    if (text == "-") {
      result = 0;
      return true;
    }
  }

  if (text.empty()) {
    return false;
  }

  // std::from_chars deliberately does not accept '+', while the canonical
  // parser does. Strip one leading plus and still require all remaining bytes.
  if (text.front() == '+') {
    text.remove_prefix(1);
    if (text.empty() || text.front() < '0' || text.front() > '9') {
      return false;
    }
  }

  int parsed = 0;
  const char* first = text.data();
  const char* last = first + text.size();
  const auto conversion = std::from_chars(first, last, parsed);
  if (conversion.ec != std::errc{} || conversion.ptr != last) {
    return false;
  }
  result = parsed;
  return true;
}

class BlockParser {
 public:
  BlockParser(const std::filesystem::path& path, std::vector<SourceLine> lines)
      : label_(file_label(path)), lines_(std::move(lines)) {}

  [[nodiscard]] bool header_count(std::size_t& count) {
    std::string text;
    if (!take("catalog entry count", text)) {
      return false;
    }
    int parsed = 0;
    if (!parse_integer(text, IntegerStyle::Strict, parsed)) {
      return fail(last_line_, "catalog entry count is not an integer");
    }
    if (parsed < 0 || static_cast<std::size_t>(parsed) > kMaxCatalogEntries) {
      return fail(last_line_, "catalog entry count must be between 0 and " +
                                  std::to_string(kMaxCatalogEntries));
    }
    count = static_cast<std::size_t>(parsed);
    return separator("header separator");
  }

  [[nodiscard]] bool integer(std::string_view field, int& value,
                             IntegerStyle style = IntegerStyle::Strict) {
    std::string text;
    if (!take(field, text)) {
      return false;
    }
    if (!parse_integer(text, style, value)) {
      return fail(last_line_, std::string(field) + " is not a valid integer");
    }
    return true;
  }

  [[nodiscard]] bool text(std::string_view field, std::string& value) {
    if (!take(field, value)) {
      return false;
    }
    if (value.empty()) {
      return fail(last_line_, std::string(field) + " cannot be empty");
    }
    return true;
  }

  [[nodiscard]] bool separator(std::string_view field) {
    std::string value;
    if (!take(field, value)) {
      return false;
    }
    if (value != "---") {
      return fail(last_line_, std::string(field) + " must be '---'");
    }
    return true;
  }

  [[nodiscard]] bool finish() {
    while (cursor_ < lines_.size() && trim(lines_[cursor_].text).empty()) {
      ++cursor_;
    }
    if (cursor_ < lines_.size() && trim(lines_[cursor_].text) == "---") {
      ++cursor_;  // A final block separator is optional in the source format.
      while (cursor_ < lines_.size() && trim(lines_[cursor_].text).empty()) {
        ++cursor_;
      }
    }
    if (cursor_ != lines_.size()) {
      return fail(lines_[cursor_].number, "unexpected data after declared blocks");
    }
    return true;
  }

  [[nodiscard]] const std::string& diagnostic() const noexcept { return diagnostic_; }

 private:
  [[nodiscard]] bool take(std::string_view field, std::string& value) {
    if (!diagnostic_.empty()) {
      return false;
    }
    if (cursor_ >= lines_.size()) {
      const auto eof_line = lines_.empty() ? std::size_t{1} : lines_.back().number + 1;
      return fail(eof_line, "truncated catalog: missing " + std::string(field));
    }
    last_line_ = lines_[cursor_].number;
    const auto cleaned = trim(lines_[cursor_].text);
    value.assign(cleaned.begin(), cleaned.end());
    ++cursor_;
    return true;
  }

  [[nodiscard]] bool fail(std::size_t line, std::string message) {
    if (diagnostic_.empty()) {
      diagnostic_ = label_ + ":" + std::to_string(line) + ": " + std::move(message);
    }
    return false;
  }

  std::string label_;
  std::vector<SourceLine> lines_;
  std::size_t cursor_{};
  std::size_t last_line_{1};
  std::string diagnostic_;
};

template <typename Record>
[[nodiscard]] bool unique_id(std::unordered_set<int>& ids, const Record& record,
                             BlockParser& parser, std::size_t block,
                             std::string& diagnostic) {
  if (ids.insert(record.id).second) {
    return true;
  }
  diagnostic = "block " + std::to_string(block) + " has duplicate id " +
               std::to_string(record.id);
  // BlockParser owns line-aware parse diagnostics, while this semantic check
  // is appended by the caller with the filename.
  (void)parser;
  return false;
}

[[nodiscard]] bool load_weapons(const std::filesystem::path& path,
                                std::vector<WeaponDefinition>& destination,
                                std::string& diagnostic) {
  destination.clear();
  std::vector<SourceLine> lines;
  if (!read_lines(path, lines, diagnostic)) {
    return false;
  }

  BlockParser parser(path, std::move(lines));
  std::size_t count = 0;
  if (!parser.header_count(count)) {
    diagnostic = parser.diagnostic();
    return false;
  }

  std::vector<WeaponDefinition> parsed;
  parsed.reserve(count);
  std::unordered_set<int> ids;
  ids.reserve(count);
  for (std::size_t index = 0; index < count; ++index) {
    WeaponDefinition weapon;
    const auto block = index + 1;
    if (!parser.integer("weapon id", weapon.id) ||
        !parser.text("weapon name", weapon.name) ||
        !parser.text("weapon type", weapon.type) ||
        !parser.integer("weapon damage", weapon.damage, IntegerStyle::Stat) ||
        !parser.integer("weapon ammunition", weapon.ammunition, IntegerStyle::Stat) ||
        !parser.integer("weapon use cost", weapon.use_cost, IntegerStyle::Stat)) {
      diagnostic = parser.diagnostic();
      return false;
    }
    std::string duplicate;
    if (!unique_id(ids, weapon, parser, block, duplicate)) {
      diagnostic = file_label(path) + ": " + duplicate;
      return false;
    }
    parsed.push_back(std::move(weapon));
    if (index + 1 < count && !parser.separator("weapon block separator")) {
      diagnostic = parser.diagnostic();
      return false;
    }
  }

  if (!parser.finish()) {
    diagnostic = parser.diagnostic();
    return false;
  }
  destination = std::move(parsed);
  return true;
}

[[nodiscard]] bool load_shields(const std::filesystem::path& path,
                                std::vector<ShieldDefinition>& destination,
                                std::string& diagnostic) {
  destination.clear();
  std::vector<SourceLine> lines;
  if (!read_lines(path, lines, diagnostic)) {
    return false;
  }

  BlockParser parser(path, std::move(lines));
  std::size_t count = 0;
  if (!parser.header_count(count)) {
    diagnostic = parser.diagnostic();
    return false;
  }

  std::vector<ShieldDefinition> parsed;
  parsed.reserve(count);
  std::unordered_set<int> ids;
  ids.reserve(count);
  for (std::size_t index = 0; index < count; ++index) {
    ShieldDefinition shield;
    const auto block = index + 1;
    if (!parser.integer("shield id", shield.id) ||
        !parser.text("shield name", shield.name) ||
        !parser.text("shield type", shield.type) ||
        !parser.integer("shield absorption", shield.absorption, IntegerStyle::Stat) ||
        !parser.integer("shield durability", shield.durability, IntegerStyle::Stat) ||
        !parser.integer("shield weight", shield.weight, IntegerStyle::Stat)) {
      diagnostic = parser.diagnostic();
      return false;
    }
    std::string duplicate;
    if (!unique_id(ids, shield, parser, block, duplicate)) {
      diagnostic = file_label(path) + ": " + duplicate;
      return false;
    }
    parsed.push_back(std::move(shield));
    if (index + 1 < count && !parser.separator("shield block separator")) {
      diagnostic = parser.diagnostic();
      return false;
    }
  }

  if (!parser.finish()) {
    diagnostic = parser.diagnostic();
    return false;
  }
  destination = std::move(parsed);
  return true;
}

[[nodiscard]] bool load_templates(const std::filesystem::path& path,
                                  std::vector<UnitTemplate>& destination,
                                  std::string& diagnostic) {
  destination.clear();
  std::vector<SourceLine> lines;
  if (!read_lines(path, lines, diagnostic)) {
    return false;
  }

  BlockParser parser(path, std::move(lines));
  std::size_t count = 0;
  if (!parser.header_count(count)) {
    diagnostic = parser.diagnostic();
    return false;
  }

  std::vector<UnitTemplate> parsed;
  parsed.reserve(count);
  std::unordered_set<int> ids;
  ids.reserve(count);
  for (std::size_t index = 0; index < count; ++index) {
    UnitTemplate unit;
    const auto block = index + 1;
    if (!parser.integer("template id", unit.id) ||
        !parser.text("template name", unit.name) ||
        !parser.integer("template fortitude", unit.fortitude, IntegerStyle::Stat) ||
        !parser.integer("template damage", unit.damage, IntegerStyle::Stat) ||
        !parser.integer("template health", unit.health, IntegerStyle::Stat) ||
        !parser.integer("template speed", unit.speed, IntegerStyle::Stat)) {
      diagnostic = parser.diagnostic();
      return false;
    }
    std::string duplicate;
    if (!unique_id(ids, unit, parser, block, duplicate)) {
      diagnostic = file_label(path) + ": " + duplicate;
      return false;
    }
    parsed.push_back(std::move(unit));
    if (index + 1 < count && !parser.separator("template block separator")) {
      diagnostic = parser.diagnostic();
      return false;
    }
  }

  if (!parser.finish()) {
    diagnostic = parser.diagnostic();
    return false;
  }
  destination = std::move(parsed);
  return true;
}

[[nodiscard]] std::filesystem::path normalized_path(const std::filesystem::path& path) {
  std::error_code error;
  auto normalized = std::filesystem::weakly_canonical(path, error);
  if (!error) {
    return normalized;
  }
  error.clear();
  normalized = std::filesystem::absolute(path, error);
  return (error ? path : normalized).lexically_normal();
}

template <typename Record>
[[nodiscard]] const Record* find_id(const std::vector<Record>& records, int id) noexcept {
  const auto found = std::find_if(records.begin(), records.end(),
                                  [id](const Record& record) { return record.id == id; });
  return found == records.end() ? nullptr : &*found;
}

template <typename Record>
[[nodiscard]] const Record* find_name(const std::vector<Record>& records,
                                      std::string_view name) noexcept {
  const auto found = std::find_if(records.begin(), records.end(),
                                  [name](const Record& record) {
                                    return std::string_view(record.name) == name;
                                  });
  return found == records.end() ? nullptr : &*found;
}

}  // namespace

std::optional<Catalog::Path> Catalog::locate_data_directory(
    const Path& explicit_directory, const Path& executable_directory,
    const Path& working_directory) {
  std::vector<Path> candidates;
  if (!explicit_directory.empty()) {
    candidates.push_back(explicit_directory);
  }
  if (!executable_directory.empty()) {
    candidates.push_back(executable_directory / "data");
    candidates.push_back(executable_directory / ".." / "data");
  }

  if (!working_directory.empty()) {
    candidates.push_back(working_directory / "data");
  } else {
    std::error_code error;
    const auto current = std::filesystem::current_path(error);
    if (!error) {
      candidates.push_back(current / "data");
    }
  }

  std::vector<Path> checked;
  for (const auto& candidate : candidates) {
    const auto normalized = normalized_path(candidate);
    if (std::find(checked.begin(), checked.end(), normalized) != checked.end()) {
      continue;
    }
    checked.push_back(normalized);
    std::error_code error;
    if (std::filesystem::is_directory(normalized, error) && !error) {
      return normalized;
    }
  }
  return std::nullopt;
}

bool Catalog::load(const Path& explicit_directory, const Path& executable_directory,
                   const Path& working_directory) {
  loaded_ = false;
  data_directory_.clear();
  diagnostics_.clear();
  weapons_.clear();
  shields_.clear();
  species_.clear();
  characters_.clear();
  heroes_.clear();

  const auto located =
      locate_data_directory(explicit_directory, executable_directory, working_directory);
  if (!located) {
    diagnostics_.emplace_back(
        "catalog data directory not found (checked explicit path, executable paths, and cwd/data)");
    return false;
  }
  data_directory_ = *located;

  bool success = true;
  auto load_one = [&](auto loader, std::string_view filename, auto& destination) {
    std::string diagnostic;
    if (!loader(data_directory_ / filename, destination, diagnostic)) {
      success = false;
      diagnostics_.push_back(std::move(diagnostic));
    }
  };

  load_one(load_weapons, "armas.txt", weapons_);
  load_one(load_shields, "escudos.txt", shields_);
  load_one(load_templates, "especie.txt", species_);
  load_one(load_templates, "personajes.txt", characters_);
  load_one(load_templates, "heroes.txt", heroes_);

  loaded_ = success;
  return loaded_;
}

const WeaponDefinition* Catalog::weapon_by_id(int id) const noexcept {
  return find_id(weapons_, id);
}

const WeaponDefinition* Catalog::weapon_by_name(std::string_view name) const noexcept {
  return find_name(weapons_, name);
}

const ShieldDefinition* Catalog::shield_by_id(int id) const noexcept {
  return find_id(shields_, id);
}

const ShieldDefinition* Catalog::shield_by_name(std::string_view name) const noexcept {
  return find_name(shields_, name);
}

const UnitTemplate* Catalog::species_by_id(int id) const noexcept {
  return find_id(species_, id);
}

const UnitTemplate* Catalog::species_by_name(std::string_view name) const noexcept {
  return find_name(species_, name);
}

const UnitTemplate* Catalog::character_by_id(int id) const noexcept {
  return find_id(characters_, id);
}

const UnitTemplate* Catalog::character_by_name(std::string_view name) const noexcept {
  return find_name(characters_, name);
}

const UnitTemplate* Catalog::hero_by_id(int id) const noexcept {
  return find_id(heroes_, id);
}

const UnitTemplate* Catalog::hero_by_name(std::string_view name) const noexcept {
  return find_name(heroes_, name);
}

}  // namespace yggdrasil
