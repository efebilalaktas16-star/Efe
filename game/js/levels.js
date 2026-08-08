// Seviye tanımları + ilerleme (yıldız) kaydı.
const EMPTY = 0;
const BUILDING = 1;
const SPAWN = 2;
const DEST = 3;
const AMBIENT = 4; // şehrin hazır, oyuncunun silemediği yolu — üzerinde kendi trafiği döner

// col sabit bir sütun boyunca, rowStart..rowEnd (dahil) arası dikey bir
// "hazır cadde" tanımı üretir — ambientRoad alanı için kullanılır.
function verticalAmbientRoad(col, rowStart, rowEnd) {
  const tiles = [];
  for (let r = rowStart; r <= rowEnd; r++) tiles.push([r, col]);
  return tiles;
}

// obstacles: [rowStart, colStart, rowEnd, colEnd] dikdörtgenleri (dahil).
// holes: obstacles'ın İÇİNDEN açılan, geçilebilir "tünel" kareleri — dar bir
// boğaz oluşturup ucuz-ama-tıkanan kısayol / pahalı-ama-güvenli dolambaç
// tercihini test eder.
const LEVEL_DEFS = [
  {
    id: 'level1',
    name: 'Küçük Kasaba',
    goalText: 'Evlerden işyerine giden bir yol kur.',
    cols: 10,
    rows: 14,
    obstacles: [[4, 3, 9, 6]],
    holes: [],
    spawn: { row: 6, col: 0 },
    dest: { row: 6, col: 9 },
    totalCars: 12,
    spawnIntervalMs: 900,
    testDurationMs: 20000,
    moveDurationMs: 400,
    passCompletionRatio: 0.85,
    traffic: ['car'],
    stars3Max: 160,
    stars2Max: 230,
  },
  {
    id: 'level2',
    name: 'Sıkışık Merkez',
    goalText:
      'Merkezdeki bloğun ortasından dar bir tünel geçer. 🚐 Minibüsler var — güzergahın tamamı bulvar olmalı. 🟣 9. sütun şehrin hazır ana caddesi, kendi trafiği var; oradan ücretsiz geçebilirsin ama bekleyebilirsin de — ya da güneyden (10-13. satır) dolanıp caddeyi hiç kesme.',
    cols: 12,
    rows: 14,
    obstacles: [[3, 3, 10, 8]],
    holes: [[6, 3, 6, 8]], // 6. satır boyunca tünel (kısa ama trafiğin tamamı buradan geçer)
    ambientRoad: verticalAmbientRoad(9, 0, 9), // 9. sütun, 0-9. satırlar arası hazır cadde
    ambientCapacity: 2,
    ambientSpawnIntervalMs: 900,
    spawn: { row: 6, col: 0 },
    dest: { row: 6, col: 11 },
    totalCars: 26,
    spawnIntervalMs: 320,
    testDurationMs: 29000,
    moveDurationMs: 400,
    passCompletionRatio: 0.85,
    traffic: ['car', 'car', 'van'],
    stars3Max: 260,
    stars2Max: 320,
  },
  {
    id: 'level3',
    name: 'Sanayi Bölgesi',
    goalText:
      'İki blok arasından dolaşan uzun bir güzergah. 🚛 Kamyonlar var — tüm yolun bulvar olması şart. En kısa geçerli rotayı bul.',
    cols: 14,
    rows: 16,
    obstacles: [
      [2, 3, 7, 6],
      [8, 7, 13, 10],
    ],
    holes: [],
    spawn: { row: 7, col: 0 },
    dest: { row: 8, col: 13 },
    totalCars: 30,
    spawnIntervalMs: 380,
    testDurationMs: 34000,
    moveDurationMs: 400,
    passCompletionRatio: 0.85,
    traffic: ['car', 'car', 'van', 'truck'],
    stars3Max: 700,
    stars2Max: 850,
  },
];

function buildLevelGrid(def) {
  const grid = [];
  for (let r = 0; r < def.rows; r++) {
    const row = [];
    for (let c = 0; c < def.cols; c++) row.push(EMPTY);
    grid.push(row);
  }
  (def.obstacles || []).forEach(([r0, c0, r1, c1]) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) grid[r][c] = BUILDING;
    }
  });
  (def.holes || []).forEach(([r0, c0, r1, c1]) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) grid[r][c] = EMPTY;
    }
  });
  (def.ambientRoad || []).forEach(([r, c]) => {
    if (grid[r][c] === EMPTY) grid[r][c] = AMBIENT;
  });
  grid[def.spawn.row][def.spawn.col] = SPAWN;
  grid[def.dest.row][def.dest.col] = DEST;
  return grid;
}

const LEVELS = LEVEL_DEFS.map((def) => ({ ...def, grid: buildLevelGrid(def) }));

const Progress = (() => {
  const KEY = 'traffic_game_progress_v1';

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function getStars(levelId) {
    const all = readAll();
    return all[levelId] || 0;
  }

  function setStars(levelId, stars) {
    const all = readAll();
    if (stars > (all[levelId] || 0)) {
      all[levelId] = stars;
      localStorage.setItem(KEY, JSON.stringify(all));
    }
  }

  function isUnlocked(index) {
    if (index === 0) return true;
    return getStars(LEVELS[index - 1].id) > 0;
  }

  return { getStars, setStars, isUnlocked };
})();
