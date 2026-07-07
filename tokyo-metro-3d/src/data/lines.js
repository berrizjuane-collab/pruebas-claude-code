/**
 * The 9 Tokyo Metro lines: ordered station sequences + per-segment travel times.
 *
 * DATA PROVENANCE (honest notes):
 *  - `color` is the official Tokyo Metro line color (hex values as published in
 *    the corporate identity: Ginza orange, Marunouchi red, Hibiya silver, Tōzai
 *    sky blue, Chiyoda green, Yūrakuchō gold, Hanzōmon purple, Namboku emerald,
 *    Fukutoshin brown).
 *  - `times[i]` = travel time in MINUTES between stations[i] and stations[i+1],
 *    hand-estimated from published local-service timetables (typical value 1–3
 *    min; suburban stretches longer). Accuracy ≈ ±1 min per segment. End-to-end
 *    sums land close to the official run times (e.g. Ginza line Shibuya→Asakusa
 *    sums to 31 min vs the official ~31 min).
 *  - `depth` is a RELATIVE stacking layer used for the 3D elevation, ordered by
 *    construction era (Ginza 1927 = shallowest … Fukutoshin 2008 = deepest).
 *    It is an aesthetic proxy for real tunnel depth, not measured depth.
 *  - The Wakōshi–Kotake-Mukaihara–Ikebukuro corridor is physically shared by the
 *    Yūrakuchō and Fukutoshin lines; it is modeled as PARALLEL EDGES (one per
 *    line) between the same vertices. This is deliberate: it is true to the
 *    service pattern and gives Kruskal genuine cycle rejections to show.
 *  - Segment distance is NOT stored here: it is derived from the projected
 *    station coordinates in buildGraph.js (straight-line km — real track is
 *    slightly longer). Time and distance therefore disagree just enough to make
 *    the "optimize by time vs distance" toggle meaningful.
 */

export const LINES = [
  {
    id: 'G', name: 'Ginza', ja: '銀座線', color: '#FF9500', depth: 0,
    stations: [
      'shibuya', 'omotesando', 'gaiemmae', 'aoyama-itchome', 'akasaka-mitsuke',
      'tameike-sanno', 'toranomon', 'shimbashi', 'ginza', 'kyobashi',
      'nihombashi', 'mitsukoshimae', 'kanda', 'suehirocho', 'ueno-hirokoji',
      'ueno', 'inaricho', 'tawaramachi', 'asakusa',
    ],
    times: [2, 2, 1, 2, 1, 2, 2, 2, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2],
  },
  {
    id: 'M', name: 'Marunouchi', ja: '丸ノ内線', color: '#F62E36', depth: 1,
    stations: [
      'ogikubo', 'minami-asagaya', 'shin-koenji', 'higashi-koenji', 'shin-nakano',
      'nakano-sakaue', 'nishi-shinjuku', 'shinjuku', 'shinjuku-sanchome',
      'shinjuku-gyoemmae', 'yotsuya-sanchome', 'yotsuya', 'akasaka-mitsuke',
      'kokkai-gijidomae', 'kasumigaseki', 'ginza', 'tokyo', 'otemachi',
      'awajicho', 'ochanomizu', 'hongo-sanchome', 'korakuen', 'myogadani',
      'shin-otsuka', 'ikebukuro',
    ],
    times: [2, 2, 1, 2, 2, 2, 1, 2, 1, 2, 2, 2, 2, 1, 2, 2, 1, 2, 1, 2, 2, 2, 2, 3],
  },
  {
    id: 'H', name: 'Hibiya', ja: '日比谷線', color: '#B5B5AC', depth: 2,
    stations: [
      'naka-meguro', 'ebisu', 'hiroo', 'roppongi', 'kamiyacho', 'toranomon-hills',
      'kasumigaseki', 'hibiya', 'ginza', 'higashi-ginza', 'tsukiji', 'hatchobori',
      'kayabacho', 'ningyocho', 'kodemmacho', 'akihabara', 'naka-okachimachi',
      'ueno', 'iriya', 'minowa', 'minami-senju', 'kita-senju',
    ],
    times: [2, 3, 3, 2, 1, 2, 2, 1, 1, 2, 2, 2, 2, 1, 2, 2, 1, 2, 2, 2, 3],
  },
  {
    id: 'T', name: 'Tōzai', ja: '東西線', color: '#009BBF', depth: 3,
    stations: [
      'nakano', 'ochiai', 'takadanobaba', 'waseda', 'kagurazaka', 'iidabashi',
      'kudanshita', 'takebashi', 'otemachi', 'nihombashi', 'kayabacho',
      'monzen-nakacho', 'kiba', 'toyocho', 'minami-sunamachi', 'nishi-kasai',
      'kasai', 'urayasu', 'minami-gyotoku', 'gyotoku', 'myoden',
      'baraki-nakayama', 'nishi-funabashi',
    ],
    times: [2, 2, 2, 2, 2, 2, 1, 2, 1, 1, 3, 1, 2, 2, 3, 2, 2, 2, 2, 2, 2, 3],
  },
  {
    id: 'C', name: 'Chiyoda', ja: '千代田線', color: '#00BB85', depth: 4,
    stations: [
      'yoyogi-uehara', 'yoyogi-koen', 'meiji-jingumae', 'omotesando', 'nogizaka',
      'akasaka', 'kokkai-gijidomae', 'kasumigaseki', 'hibiya', 'nijubashimae',
      'otemachi', 'shin-ochanomizu', 'yushima', 'nezu', 'sendagi',
      'nishi-nippori', 'machiya', 'kita-senju', 'ayase', 'kita-ayase',
    ],
    times: [2, 2, 1, 2, 2, 2, 1, 2, 1, 1, 2, 2, 1, 2, 2, 2, 3, 3, 4],
  },
  {
    id: 'Y', name: 'Yūrakuchō', ja: '有楽町線', color: '#C1A470', depth: 5,
    stations: [
      'wakoshi', 'chikatetsu-narimasu', 'chikatetsu-akatsuka', 'heiwadai',
      'hikawadai', 'kotake-mukaihara', 'senkawa', 'kanamecho', 'ikebukuro',
      'higashi-ikebukuro', 'gokokuji', 'edogawabashi', 'iidabashi', 'ichigaya',
      'kojimachi', 'nagatacho', 'sakuradamon', 'yurakucho', 'ginza-itchome',
      'shintomicho', 'tsukishima', 'toyosu', 'tatsumi', 'shin-kiba',
    ],
    times: [3, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 1, 2, 1, 1, 1, 2, 2, 2, 2],
  },
  {
    id: 'Z', name: 'Hanzōmon', ja: '半蔵門線', color: '#8F76D6', depth: 6,
    stations: [
      'shibuya', 'omotesando', 'aoyama-itchome', 'nagatacho', 'hanzomon',
      'kudanshita', 'jimbocho', 'otemachi', 'mitsukoshimae', 'suitengumae',
      'kiyosumi-shirakawa', 'sumiyoshi', 'kinshicho', 'oshiage',
    ],
    times: [2, 2, 3, 1, 2, 1, 3, 1, 2, 2, 3, 2, 2],
  },
  {
    id: 'N', name: 'Namboku', ja: '南北線', color: '#00AC9B', depth: 7,
    stations: [
      'meguro', 'shirokanedai', 'shirokane-takanawa', 'azabu-juban',
      'roppongi-itchome', 'tameike-sanno', 'nagatacho', 'yotsuya', 'ichigaya',
      'iidabashi', 'korakuen', 'todaimae', 'hon-komagome', 'komagome',
      'nishigahara', 'oji', 'oji-kamiya', 'shimo', 'akabane-iwabuchi',
    ],
    times: [2, 1, 3, 2, 2, 1, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  },
  {
    id: 'F', name: 'Fukutoshin', ja: '副都心線', color: '#9C5E31', depth: 8,
    stations: [
      'wakoshi', 'chikatetsu-narimasu', 'chikatetsu-akatsuka', 'heiwadai',
      'hikawadai', 'kotake-mukaihara', 'senkawa', 'kanamecho', 'ikebukuro',
      'zoshigaya', 'nishi-waseda', 'higashi-shinjuku', 'shinjuku-sanchome',
      'kitasando', 'meiji-jingumae', 'shibuya',
    ],
    times: [3, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2],
  },
];

export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
