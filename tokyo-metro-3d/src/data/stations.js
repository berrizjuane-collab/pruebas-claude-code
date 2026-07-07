/**
 * Station registry — every unique station of the Tokyo Metro network (all 9 lines).
 *
 * DATA PROVENANCE (honest notes):
 *  - Coverage: the complete Tokyo Metro system (Ginza, Marunouchi, Hibiya, Tōzai,
 *    Chiyoda, Yūrakuchō, Hanzōmon, Namboku, Fukutoshin) — 141 unique stations.
 *    EXCLUDED: the Marunouchi Hōnanchō branch (Nakano-shimbashi / Nakano-fujimichō /
 *    Hōnanchō) and the entire Toei Subway network (different operator).
 *  - Coordinates: approximate real geographic positions (lat / lon), hand-placed from
 *    general knowledge of Tokyo geography. They are accurate to roughly ±300 m — good
 *    enough to reproduce the recognizable shape of the network, not survey-grade.
 *  - Japanese names: official station names.
 *
 * A station that appears on several lines exists exactly ONCE here; lines reference
 * it by id, which is what makes interchanges real graph vertices (not duplicates).
 */

export const STATIONS = {
  // ─── Ginza line corridor ────────────────────────────────────────────────
  'shibuya':            { name: 'Shibuya',            ja: '渋谷',        lat: 35.658, lon: 139.702 },
  'omotesando':         { name: 'Omote-sandō',        ja: '表参道',      lat: 35.665, lon: 139.712 },
  'gaiemmae':           { name: 'Gaiemmae',           ja: '外苑前',      lat: 35.670, lon: 139.718 },
  'aoyama-itchome':     { name: 'Aoyama-itchōme',     ja: '青山一丁目',  lat: 35.673, lon: 139.724 },
  'akasaka-mitsuke':    { name: 'Akasaka-mitsuke',    ja: '赤坂見附',    lat: 35.677, lon: 139.737 },
  'tameike-sanno':      { name: 'Tameike-sannō',      ja: '溜池山王',    lat: 35.674, lon: 139.741 },
  'toranomon':          { name: 'Toranomon',          ja: '虎ノ門',      lat: 35.670, lon: 139.750 },
  'shimbashi':          { name: 'Shimbashi',          ja: '新橋',        lat: 35.666, lon: 139.758 },
  'ginza':              { name: 'Ginza',              ja: '銀座',        lat: 35.672, lon: 139.764 },
  'kyobashi':           { name: 'Kyōbashi',           ja: '京橋',        lat: 35.677, lon: 139.770 },
  'nihombashi':         { name: 'Nihombashi',         ja: '日本橋',      lat: 35.682, lon: 139.774 },
  'mitsukoshimae':      { name: 'Mitsukoshimae',      ja: '三越前',      lat: 35.686, lon: 139.773 },
  'kanda':              { name: 'Kanda',              ja: '神田',        lat: 35.691, lon: 139.771 },
  'suehirocho':         { name: 'Suehirochō',         ja: '末広町',      lat: 35.702, lon: 139.772 },
  'ueno-hirokoji':      { name: 'Ueno-hirokōji',      ja: '上野広小路',  lat: 35.708, lon: 139.773 },
  'ueno':               { name: 'Ueno',               ja: '上野',        lat: 35.711, lon: 139.777 },
  'inaricho':           { name: 'Inarichō',           ja: '稲荷町',      lat: 35.711, lon: 139.783 },
  'tawaramachi':        { name: 'Tawaramachi',        ja: '田原町',      lat: 35.710, lon: 139.790 },
  'asakusa':            { name: 'Asakusa',            ja: '浅草',        lat: 35.711, lon: 139.797 },

  // ─── Marunouchi line corridor ───────────────────────────────────────────
  'ogikubo':            { name: 'Ogikubo',            ja: '荻窪',        lat: 35.705, lon: 139.620 },
  'minami-asagaya':     { name: 'Minami-Asagaya',     ja: '南阿佐ケ谷',  lat: 35.700, lon: 139.635 },
  'shin-koenji':        { name: 'Shin-Kōenji',        ja: '新高円寺',    lat: 35.698, lon: 139.648 },
  'higashi-koenji':     { name: 'Higashi-Kōenji',     ja: '東高円寺',    lat: 35.699, lon: 139.655 },
  'shin-nakano':        { name: 'Shin-Nakano',        ja: '新中野',      lat: 35.697, lon: 139.665 },
  'nakano-sakaue':      { name: 'Nakano-sakaue',      ja: '中野坂上',    lat: 35.697, lon: 139.682 },
  'nishi-shinjuku':     { name: 'Nishi-Shinjuku',     ja: '西新宿',      lat: 35.694, lon: 139.692 },
  'shinjuku':           { name: 'Shinjuku',           ja: '新宿',        lat: 35.690, lon: 139.700 },
  'shinjuku-sanchome':  { name: 'Shinjuku-sanchōme',  ja: '新宿三丁目',  lat: 35.691, lon: 139.706 },
  'shinjuku-gyoemmae':  { name: 'Shinjuku-gyoemmae',  ja: '新宿御苑前',  lat: 35.688, lon: 139.711 },
  'yotsuya-sanchome':   { name: 'Yotsuya-sanchōme',   ja: '四谷三丁目',  lat: 35.688, lon: 139.720 },
  'yotsuya':            { name: 'Yotsuya',            ja: '四ツ谷',      lat: 35.686, lon: 139.730 },
  'kokkai-gijidomae':   { name: 'Kokkai-gijidōmae',   ja: '国会議事堂前', lat: 35.674, lon: 139.745 },
  'kasumigaseki':       { name: 'Kasumigaseki',       ja: '霞ケ関',      lat: 35.675, lon: 139.752 },
  'tokyo':              { name: 'Tokyo',              ja: '東京',        lat: 35.681, lon: 139.766 },
  'otemachi':           { name: 'Ōtemachi',           ja: '大手町',      lat: 35.685, lon: 139.766 },
  'awajicho':           { name: 'Awajichō',           ja: '淡路町',      lat: 35.695, lon: 139.769 },
  'ochanomizu':         { name: 'Ochanomizu',         ja: '御茶ノ水',    lat: 35.699, lon: 139.765 },
  'hongo-sanchome':     { name: 'Hongō-sanchōme',     ja: '本郷三丁目',  lat: 35.707, lon: 139.760 },
  'korakuen':           { name: 'Kōrakuen',           ja: '後楽園',      lat: 35.708, lon: 139.752 },
  'myogadani':          { name: 'Myōgadani',          ja: '茗荷谷',      lat: 35.717, lon: 139.743 },
  'shin-otsuka':        { name: 'Shin-Ōtsuka',        ja: '新大塚',      lat: 35.726, lon: 139.729 },
  'ikebukuro':          { name: 'Ikebukuro',          ja: '池袋',        lat: 35.729, lon: 139.711 },

  // ─── Hibiya line corridor ───────────────────────────────────────────────
  'naka-meguro':        { name: 'Naka-Meguro',        ja: '中目黒',      lat: 35.644, lon: 139.699 },
  'ebisu':              { name: 'Ebisu',              ja: '恵比寿',      lat: 35.647, lon: 139.710 },
  'hiroo':              { name: 'Hiroo',              ja: '広尾',        lat: 35.652, lon: 139.722 },
  'roppongi':           { name: 'Roppongi',           ja: '六本木',      lat: 35.663, lon: 139.731 },
  'kamiyacho':          { name: 'Kamiyachō',          ja: '神谷町',      lat: 35.663, lon: 139.745 },
  'toranomon-hills':    { name: 'Toranomon Hills',    ja: '虎ノ門ヒルズ', lat: 35.667, lon: 139.749 },
  'hibiya':             { name: 'Hibiya',             ja: '日比谷',      lat: 35.675, lon: 139.760 },
  'higashi-ginza':      { name: 'Higashi-Ginza',      ja: '東銀座',      lat: 35.670, lon: 139.767 },
  'tsukiji':            { name: 'Tsukiji',            ja: '築地',        lat: 35.667, lon: 139.772 },
  'hatchobori':         { name: 'Hatchōbori',         ja: '八丁堀',      lat: 35.675, lon: 139.778 },
  'kayabacho':          { name: 'Kayabachō',          ja: '茅場町',      lat: 35.680, lon: 139.780 },
  'ningyocho':          { name: 'Ningyōchō',          ja: '人形町',      lat: 35.686, lon: 139.783 },
  'kodemmacho':         { name: 'Kodemmachō',         ja: '小伝馬町',    lat: 35.692, lon: 139.780 },
  'akihabara':          { name: 'Akihabara',          ja: '秋葉原',      lat: 35.698, lon: 139.773 },
  'naka-okachimachi':   { name: 'Naka-Okachimachi',   ja: '仲御徒町',    lat: 35.707, lon: 139.775 },
  'iriya':              { name: 'Iriya',              ja: '入谷',        lat: 35.721, lon: 139.783 },
  'minowa':             { name: 'Minowa',             ja: '三ノ輪',      lat: 35.730, lon: 139.792 },
  'minami-senju':       { name: 'Minami-Senju',       ja: '南千住',      lat: 35.734, lon: 139.799 },
  'kita-senju':         { name: 'Kita-Senju',         ja: '北千住',      lat: 35.749, lon: 139.805 },

  // ─── Tōzai line corridor ────────────────────────────────────────────────
  'nakano':             { name: 'Nakano',             ja: '中野',        lat: 35.706, lon: 139.666 },
  'ochiai':             { name: 'Ochiai',             ja: '落合',        lat: 35.711, lon: 139.686 },
  'takadanobaba':       { name: 'Takadanobaba',       ja: '高田馬場',    lat: 35.713, lon: 139.704 },
  'waseda':             { name: 'Waseda',             ja: '早稲田',      lat: 35.708, lon: 139.719 },
  'kagurazaka':         { name: 'Kagurazaka',         ja: '神楽坂',      lat: 35.703, lon: 139.734 },
  'iidabashi':          { name: 'Iidabashi',          ja: '飯田橋',      lat: 35.702, lon: 139.745 },
  'kudanshita':         { name: 'Kudanshita',         ja: '九段下',      lat: 35.696, lon: 139.751 },
  'takebashi':          { name: 'Takebashi',          ja: '竹橋',        lat: 35.691, lon: 139.757 },
  'monzen-nakacho':     { name: 'Monzen-nakachō',     ja: '門前仲町',    lat: 35.672, lon: 139.796 },
  'kiba':               { name: 'Kiba',               ja: '木場',        lat: 35.669, lon: 139.806 },
  'toyocho':            { name: 'Tōyōchō',            ja: '東陽町',      lat: 35.669, lon: 139.817 },
  'minami-sunamachi':   { name: 'Minami-Sunamachi',   ja: '南砂町',      lat: 35.669, lon: 139.831 },
  'nishi-kasai':        { name: 'Nishi-Kasai',        ja: '西葛西',      lat: 35.665, lon: 139.859 },
  'kasai':              { name: 'Kasai',              ja: '葛西',        lat: 35.664, lon: 139.873 },
  'urayasu':            { name: 'Urayasu',            ja: '浦安',        lat: 35.666, lon: 139.893 },
  'minami-gyotoku':     { name: 'Minami-Gyōtoku',     ja: '南行徳',      lat: 35.674, lon: 139.909 },
  'gyotoku':            { name: 'Gyōtoku',            ja: '行徳',        lat: 35.683, lon: 139.918 },
  'myoden':             { name: 'Myōden',             ja: '妙典',        lat: 35.694, lon: 139.928 },
  'baraki-nakayama':    { name: 'Baraki-Nakayama',    ja: '原木中山',    lat: 35.703, lon: 139.942 },
  'nishi-funabashi':    { name: 'Nishi-Funabashi',    ja: '西船橋',      lat: 35.707, lon: 139.959 },

  // ─── Chiyoda line corridor ──────────────────────────────────────────────
  'yoyogi-uehara':      { name: 'Yoyogi-Uehara',      ja: '代々木上原',  lat: 35.669, lon: 139.680 },
  'yoyogi-koen':        { name: 'Yoyogi-kōen',        ja: '代々木公園',  lat: 35.669, lon: 139.690 },
  'meiji-jingumae':     { name: 'Meiji-jingūmae',     ja: '明治神宮前',  lat: 35.668, lon: 139.706 },
  'nogizaka':           { name: 'Nogizaka',           ja: '乃木坂',      lat: 35.666, lon: 139.727 },
  'akasaka':            { name: 'Akasaka',            ja: '赤坂',        lat: 35.672, lon: 139.736 },
  'nijubashimae':       { name: 'Nijūbashimae',       ja: '二重橋前',    lat: 35.680, lon: 139.762 },
  'shin-ochanomizu':    { name: 'Shin-Ochanomizu',    ja: '新御茶ノ水',  lat: 35.698, lon: 139.766 },
  'yushima':            { name: 'Yushima',            ja: '湯島',        lat: 35.708, lon: 139.769 },
  'nezu':               { name: 'Nezu',               ja: '根津',        lat: 35.717, lon: 139.766 },
  'sendagi':            { name: 'Sendagi',            ja: '千駄木',      lat: 35.723, lon: 139.764 },
  'nishi-nippori':      { name: 'Nishi-Nippori',      ja: '西日暮里',    lat: 35.732, lon: 139.767 },
  'machiya':            { name: 'Machiya',            ja: '町屋',        lat: 35.742, lon: 139.781 },
  'ayase':              { name: 'Ayase',              ja: '綾瀬',        lat: 35.762, lon: 139.826 },
  'kita-ayase':         { name: 'Kita-Ayase',         ja: '北綾瀬',      lat: 35.776, lon: 139.831 },

  // ─── Yūrakuchō / Fukutoshin shared corridor + Yūrakuchō east ───────────
  'wakoshi':            { name: 'Wakōshi',            ja: '和光市',      lat: 35.788, lon: 139.612 },
  'chikatetsu-narimasu':{ name: 'Chikatetsu-Narimasu',ja: '地下鉄成増',  lat: 35.779, lon: 139.630 },
  'chikatetsu-akatsuka':{ name: 'Chikatetsu-Akatsuka',ja: '地下鉄赤塚',  lat: 35.771, lon: 139.643 },
  'heiwadai':           { name: 'Heiwadai',           ja: '平和台',      lat: 35.758, lon: 139.653 },
  'hikawadai':          { name: 'Hikawadai',          ja: '氷川台',      lat: 35.749, lon: 139.661 },
  'kotake-mukaihara':   { name: 'Kotake-Mukaihara',   ja: '小竹向原',    lat: 35.743, lon: 139.679 },
  'senkawa':            { name: 'Senkawa',            ja: '千川',        lat: 35.738, lon: 139.690 },
  'kanamecho':          { name: 'Kanamechō',          ja: '要町',        lat: 35.734, lon: 139.699 },
  'higashi-ikebukuro':  { name: 'Higashi-Ikebukuro',  ja: '東池袋',      lat: 35.723, lon: 139.720 },
  'gokokuji':           { name: 'Gokokuji',           ja: '護国寺',      lat: 35.718, lon: 139.727 },
  'edogawabashi':       { name: 'Edogawabashi',       ja: '江戸川橋',    lat: 35.712, lon: 139.738 },
  'ichigaya':           { name: 'Ichigaya',           ja: '市ケ谷',      lat: 35.694, lon: 139.736 },
  'kojimachi':          { name: 'Kōjimachi',          ja: '麹町',        lat: 35.684, lon: 139.740 },
  'nagatacho':          { name: 'Nagatachō',          ja: '永田町',      lat: 35.679, lon: 139.740 },
  'sakuradamon':        { name: 'Sakuradamon',        ja: '桜田門',      lat: 35.677, lon: 139.753 },
  'yurakucho':          { name: 'Yūrakuchō',          ja: '有楽町',      lat: 35.675, lon: 139.763 },
  'ginza-itchome':      { name: 'Ginza-itchōme',      ja: '銀座一丁目',  lat: 35.674, lon: 139.767 },
  'shintomicho':        { name: 'Shintomichō',        ja: '新富町',      lat: 35.671, lon: 139.777 },
  'tsukishima':         { name: 'Tsukishima',         ja: '月島',        lat: 35.664, lon: 139.784 },
  'toyosu':             { name: 'Toyosu',             ja: '豊洲',        lat: 35.655, lon: 139.796 },
  'tatsumi':            { name: 'Tatsumi',            ja: '辰巳',        lat: 35.645, lon: 139.810 },
  'shin-kiba':          { name: 'Shin-Kiba',          ja: '新木場',      lat: 35.646, lon: 139.827 },

  // ─── Hanzōmon line east ─────────────────────────────────────────────────
  'hanzomon':           { name: 'Hanzōmon',           ja: '半蔵門',      lat: 35.686, lon: 139.741 },
  'jimbocho':           { name: 'Jimbōchō',           ja: '神保町',      lat: 35.696, lon: 139.758 },
  'suitengumae':        { name: 'Suitengūmae',        ja: '水天宮前',    lat: 35.682, lon: 139.786 },
  'kiyosumi-shirakawa': { name: 'Kiyosumi-shirakawa', ja: '清澄白河',    lat: 35.682, lon: 139.800 },
  'sumiyoshi':          { name: 'Sumiyoshi',          ja: '住吉',        lat: 35.690, lon: 139.815 },
  'kinshicho':          { name: 'Kinshichō',          ja: '錦糸町',      lat: 35.697, lon: 139.814 },
  'oshiage':            { name: 'Oshiage',            ja: '押上',        lat: 35.710, lon: 139.813 },

  // ─── Namboku line corridor ──────────────────────────────────────────────
  'meguro':             { name: 'Meguro',             ja: '目黒',        lat: 35.634, lon: 139.716 },
  'shirokanedai':       { name: 'Shirokanedai',       ja: '白金台',      lat: 35.638, lon: 139.726 },
  'shirokane-takanawa': { name: 'Shirokane-takanawa', ja: '白金高輪',    lat: 35.643, lon: 139.734 },
  'azabu-juban':        { name: 'Azabu-jūban',        ja: '麻布十番',    lat: 35.656, lon: 139.737 },
  'roppongi-itchome':   { name: 'Roppongi-itchōme',   ja: '六本木一丁目', lat: 35.664, lon: 139.740 },
  'todaimae':           { name: 'Tōdaimae',           ja: '東大前',      lat: 35.718, lon: 139.757 },
  'hon-komagome':       { name: 'Hon-Komagome',       ja: '本駒込',      lat: 35.726, lon: 139.749 },
  'komagome':           { name: 'Komagome',           ja: '駒込',        lat: 35.736, lon: 139.747 },
  'nishigahara':        { name: 'Nishigahara',        ja: '西ケ原',      lat: 35.744, lon: 139.741 },
  'oji':                { name: 'Ōji',                ja: '王子',        lat: 35.753, lon: 139.738 },
  'oji-kamiya':         { name: 'Ōji-kamiya',         ja: '王子神谷',    lat: 35.766, lon: 139.735 },
  'shimo':              { name: 'Shimo',              ja: '志茂',        lat: 35.775, lon: 139.729 },
  'akabane-iwabuchi':   { name: 'Akabane-iwabuchi',   ja: '赤羽岩淵',    lat: 35.783, lon: 139.722 },

  // ─── Fukutoshin line south of Ikebukuro ─────────────────────────────────
  'zoshigaya':          { name: 'Zōshigaya',          ja: '雑司が谷',    lat: 35.718, lon: 139.712 },
  'nishi-waseda':       { name: 'Nishi-waseda',       ja: '西早稲田',    lat: 35.708, lon: 139.710 },
  'higashi-shinjuku':   { name: 'Higashi-Shinjuku',   ja: '東新宿',      lat: 35.698, lon: 139.707 },
  'kitasando':          { name: 'Kitasandō',          ja: '北参道',      lat: 35.680, lon: 139.704 },
};

/**
 * Numbered exits per station — SIMULATED data (deliberately, per project spec).
 * Generated deterministically from the station id so it is stable across runs:
 * interchange hubs get lettered exit groups (A1…, B1…), smaller stations get
 * plain numbered exits. Counts are plausible for Tokyo Metro but not sourced.
 */
export function exitsFor(id, lineCount) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = Math.abs(h);
  const exits = [];
  if (lineCount >= 2) {
    const groups = Math.min(1 + lineCount, 4);
    for (let g = 0; g < groups; g++) {
      const letter = String.fromCharCode(65 + g); // A, B, C, D
      const n = 2 + ((h >> (g * 3)) % 4);         // 2–5 exits per group
      for (let i = 1; i <= n; i++) exits.push(`${letter}${i}`);
    }
  } else {
    const n = 2 + (h % 4); // 2–5 exits
    for (let i = 1; i <= n; i++) exits.push(String(i));
  }
  return exits;
}
