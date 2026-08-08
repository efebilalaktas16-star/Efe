// Trafik Ustası — Seviye 1 prototipi.
// Basit ızgara tabanlı şehir: boş karelere yol çiz, arabalar evden işyerine aksın,
// ne kadar az paraya çözersen o kadar çok yıldız kazan.
(function () {
  const TILE = 36;
  const EMPTY = 0;
  const BUILDING = 1;
  const SPAWN = 2;
  const DEST = 3;

  const ROAD_TYPES = {
    normal: { cost: 10, capacity: 1, color: '#64748b', lightColor: '#94a3b8' },
    avenue: { cost: 25, capacity: 3, color: '#f59e0b', lightColor: '#fbbf24' },
  };

  // ---- Seviye 1 tanımı ----
  function buildLevel1() {
    const cols = 10;
    const rows = 14;
    const grid = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) row.push(EMPTY);
      grid.push(row);
    }
    // Şehir merkezi bloğu (bina) — düz yol gitmeyi engeller, üstten ya da alttan dolanman gerekir.
    for (let r = 4; r <= 9; r++) {
      for (let c = 3; c <= 6; c++) grid[r][c] = BUILDING;
    }
    const spawn = { row: 6, col: 0 };
    const dest = { row: 6, col: 9 };
    grid[spawn.row][spawn.col] = SPAWN;
    grid[dest.row][dest.col] = DEST;

    return {
      name: 'Küçük Kasaba',
      goalText: 'Evlerden işyerine giden bir yol kur.',
      cols,
      rows,
      grid,
      spawn,
      dest,
      totalCars: 12,
      spawnIntervalMs: 900,
      testDurationMs: 20000,
      moveDurationMs: 400,
      passCompletionRatio: 0.85,
      stars3Max: 160,
      stars2Max: 230,
    };
  }

  const level = buildLevel1();

  // ---- DOM ----
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const moneyDisplay = document.getElementById('moneyDisplay');
  const levelTitle = document.getElementById('levelTitle');
  const levelGoalText = document.getElementById('levelGoalText');
  const resultOverlay = document.getElementById('resultOverlay');
  const resultTitle = document.getElementById('resultTitle');
  const resultStars = document.getElementById('resultStars');
  const resultStats = document.getElementById('resultStats');
  const retryBtn = document.getElementById('retryBtn');
  const roadNormalBtn = document.getElementById('roadNormalBtn');
  const roadAvenueBtn = document.getElementById('roadAvenueBtn');
  const eraseBtn = document.getElementById('eraseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const testBtn = document.getElementById('testBtn');

  levelTitle.textContent = `Seviye 1 · ${level.name}`;
  levelGoalText.textContent = level.goalText;

  canvas.width = level.cols * TILE;
  canvas.height = level.rows * TILE;

  // ---- Durum ----
  const roads = new Map(); // "r,c" -> { type: 'normal'|'avenue' }
  let currentTool = 'normal';
  let painting = false;
  let money = 0;
  let testing = false;
  let cars = [];
  let path = null; // testte kullanılan tek dosya güzergah (tile key dizisi)
  let occupancy = new Map();
  let spawnedCount = 0;
  let completedCount = 0;
  let testStartedAt = 0;
  let spawnTimer = null;
  let animHandle = null;

  function key(r, c) {
    return `${r},${c}`;
  }

  function tileType(r, c) {
    if (r < 0 || c < 0 || r >= level.rows || c >= level.cols) return null;
    return level.grid[r][c];
  }

  function isBuildable(r, c) {
    const t = tileType(r, c);
    return t === EMPTY;
  }

  function recomputeMoney() {
    let sum = 0;
    roads.forEach((r) => {
      sum += ROAD_TYPES[r.type].cost;
    });
    money = sum;
    moneyDisplay.textContent = `₺${money}`;
  }

  // ---- Çizim ----
  function draw() {
    ctx.fillStyle = '#12213a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const t = level.grid[r][c];

        if (t === BUILDING) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
          ctx.fillStyle = '#334155';
          ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
          continue;
        }

        ctx.fillStyle = '#0e1a2f';
        ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);

        const road = roads.get(key(r, c));
        if (road) {
          const def = ROAD_TYPES[road.type];
          ctx.fillStyle = def.color;
          ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        }

        if (t === SPAWN) {
          ctx.fillStyle = '#22c55e';
          roundRect(x + 5, y + 5, TILE - 10, TILE - 10, 6);
          ctx.fill();
        } else if (t === DEST) {
          ctx.fillStyle = '#0ea5e9';
          roundRect(x + 5, y + 5, TILE - 10, TILE - 10, 6);
          ctx.fill();
        }
      }
    }

    // arabalar
    cars.forEach((car) => drawCar(car));
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function tileCenter(r, c) {
    return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
  }

  function drawCar(car) {
    const now = performance.now();
    const from = tileCenter(car.r, car.c);
    let x = from.x;
    let y = from.y;
    if (car.movingTo) {
      const to = tileCenter(car.movingTo.r, car.movingTo.c);
      const t = Math.min(1, (now - car.moveStartedAt) / level.moveDurationMs);
      x = from.x + (to.x - from.x) * t;
      y = from.y + (to.y - from.y) * t;
    }
    ctx.fillStyle = car.done ? '#22c55e' : '#f1f5f9';
    roundRect(x - 7, y - 5, 14, 10, 3);
    ctx.fill();
  }

  // ---- Girdi: sürükleyerek yol çizme ----
  function pointToTile(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (evt.clientX - rect.left) * scaleX;
    const py = (evt.clientY - rect.top) * scaleY;
    return { r: Math.floor(py / TILE), c: Math.floor(px / TILE) };
  }

  function applyToolAt(r, c) {
    if (testing) return;
    if (!isBuildable(r, c)) return;
    const k = key(r, c);
    if (currentTool === 'erase') {
      if (roads.has(k)) {
        roads.delete(k);
        recomputeMoney();
        draw();
      }
      return;
    }
    const existing = roads.get(k);
    if (existing && existing.type === currentTool) return;
    roads.set(k, { type: currentTool });
    recomputeMoney();
    draw();
  }

  function handleDown(evt) {
    if (testing) return;
    painting = true;
    const { r, c } = pointToTile(evt);
    applyToolAt(r, c);
  }
  function handleMove(evt) {
    if (!painting) return;
    const { r, c } = pointToTile(evt);
    applyToolAt(r, c);
  }
  function handleUp() {
    painting = false;
  }

  canvas.addEventListener('mousedown', handleDown);
  canvas.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleUp);

  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      const t = e.touches[0];
      handleDown({ clientX: t.clientX, clientY: t.clientY });
    },
    { passive: false }
  );
  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      const t = e.touches[0];
      handleMove({ clientX: t.clientX, clientY: t.clientY });
    },
    { passive: false }
  );
  canvas.addEventListener('touchend', handleUp);
  canvas.addEventListener('touchcancel', handleUp);

  // ---- Araç seçimi ----
  function selectTool(tool) {
    currentTool = tool;
    [roadNormalBtn, roadAvenueBtn, eraseBtn].forEach((b) => b.classList.remove('active'));
    if (tool === 'normal') roadNormalBtn.classList.add('active');
    if (tool === 'avenue') roadAvenueBtn.classList.add('active');
    if (tool === 'erase') eraseBtn.classList.add('active');
  }
  roadNormalBtn.addEventListener('click', () => selectTool('normal'));
  roadAvenueBtn.addEventListener('click', () => selectTool('avenue'));
  eraseBtn.addEventListener('click', () => selectTool('erase'));

  resetBtn.addEventListener('click', () => {
    if (testing) return;
    roads.clear();
    recomputeMoney();
    draw();
  });

  // ---- Yol grafiği + BFS ----
  function neighbors(r, c) {
    return [
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ];
  }

  function isTraversable(r, c) {
    const t = tileType(r, c);
    if (t === SPAWN || t === DEST) return true;
    return roads.has(key(r, c));
  }

  function findPath() {
    const startKey = key(level.spawn.row, level.spawn.col);
    const goalKey = key(level.dest.row, level.dest.col);
    const visited = new Set([startKey]);
    const prev = new Map();
    const queue = [{ r: level.spawn.row, c: level.spawn.col }];

    while (queue.length) {
      const cur = queue.shift();
      const curKey = key(cur.r, cur.c);
      if (curKey === goalKey) break;

      neighbors(cur.r, cur.c).forEach((n) => {
        const nKey = key(n.r, n.c);
        if (visited.has(nKey)) return;
        if (!isTraversable(n.r, n.c)) return;
        visited.add(nKey);
        prev.set(nKey, curKey);
        queue.push(n);
      });
    }

    if (!visited.has(goalKey)) return null;

    const pathKeys = [goalKey];
    let cursor = goalKey;
    while (cursor !== startKey) {
      cursor = prev.get(cursor);
      pathKeys.unshift(cursor);
    }
    return pathKeys.map((k) => {
      const [r, c] = k.split(',').map(Number);
      return { r, c };
    });
  }

  function tileCapacity(r, c) {
    const t = tileType(r, c);
    if (t === SPAWN || t === DEST) return Infinity;
    const road = roads.get(key(r, c));
    return road ? ROAD_TYPES[road.type].capacity : 0;
  }

  // ---- Test simülasyonu ----
  function startTest() {
    if (testing) return;
    const found = findPath();
    if (!found) {
      flashMessage('Önce evden işyerine bağlı bir yol kurman lazım.');
      return;
    }
    path = found;
    testing = true;
    cars = [];
    occupancy = new Map();
    spawnedCount = 0;
    completedCount = 0;
    testStartedAt = performance.now();
    testBtn.disabled = true;
    testBtn.style.opacity = '0.5';

    spawnTimer = setInterval(() => {
      if (spawnedCount >= level.totalCars) {
        clearInterval(spawnTimer);
        return;
      }
      spawnCar();
    }, level.spawnIntervalMs);

    animHandle = requestAnimationFrame(tick);
    setTimeout(endTest, level.testDurationMs);
  }

  function spawnCar() {
    spawnedCount++;
    const startTile = path[0];
    const kStart = key(startTile.r, startTile.c);
    occupancy.set(kStart, (occupancy.get(kStart) || 0) + 1);
    cars.push({
      pathIndex: 0,
      r: startTile.r,
      c: startTile.c,
      movingTo: null,
      moveStartedAt: 0,
      done: false,
    });
  }

  function tick() {
    if (!testing) return;
    const now = performance.now();

    cars.forEach((car) => {
      if (car.done) return;

      if (car.movingTo) {
        if (now - car.moveStartedAt >= level.moveDurationMs) {
          // hareketi tamamla
          const fromKey = key(car.r, car.c);
          occupancy.set(fromKey, Math.max(0, (occupancy.get(fromKey) || 1) - 1));
          car.r = car.movingTo.r;
          car.c = car.movingTo.c;
          car.movingTo = null;
          car.pathIndex++;
          if (car.pathIndex >= path.length - 1) {
            car.done = true;
            completedCount++;
          }
        }
        return;
      }

      // sıradaki kareye geçmeyi dene
      const next = path[car.pathIndex + 1];
      if (!next) {
        car.done = true;
        return;
      }
      const nKey = key(next.r, next.c);
      const cap = tileCapacity(next.r, next.c);
      const occ = occupancy.get(nKey) || 0;
      if (occ < cap) {
        occupancy.set(nKey, occ + 1);
        car.movingTo = next;
        car.moveStartedAt = now;
      }
      // kapasite doluysa araç olduğu yerde bekler (bir sonraki tick'te tekrar dener)
    });

    draw();
    animHandle = requestAnimationFrame(tick);
  }

  function endTest() {
    if (!testing) return;
    testing = false;
    clearInterval(spawnTimer);
    cancelAnimationFrame(animHandle);
    testBtn.disabled = false;
    testBtn.style.opacity = '1';

    const ratio = spawnedCount > 0 ? completedCount / spawnedCount : 0;
    showResult(ratio);
  }

  function showResult(ratio) {
    let stars = 0;
    let title;
    if (ratio < level.passCompletionRatio) {
      title = 'Trafik Çözülemedi';
      stars = 0;
    } else if (money <= level.stars3Max) {
      title = 'Mükemmel!';
      stars = 3;
    } else if (money <= level.stars2Max) {
      title = 'İyi İş';
      stars = 2;
    } else {
      title = 'Tamamlandı';
      stars = 1;
    }

    resultTitle.textContent = title;
    resultStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    resultStats.innerHTML = `
      Harcanan: <strong>₺${money}</strong><br />
      Varan araç: <strong>${completedCount}/${spawnedCount}</strong> (%${Math.round(ratio * 100)})
    `;
    resultOverlay.classList.add('show');
  }

  retryBtn.addEventListener('click', () => {
    resultOverlay.classList.remove('show');
    cars = [];
    draw();
  });

  testBtn.addEventListener('click', startTest);

  let messageTimer = null;
  function flashMessage(msg) {
    levelGoalText.textContent = msg;
    levelGoalText.style.color = '#f87171';
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      levelGoalText.textContent = level.goalText;
      levelGoalText.style.color = '';
    }, 2600);
  }

  selectTool('normal');
  recomputeMoney();
  draw();
})();
