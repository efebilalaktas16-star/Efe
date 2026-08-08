// Trafik Ustası — Seviye 1 prototipi.
// Basit ızgara tabanlı şehir: boş karelere yol çiz, arabalar evden işyerine aksın,
// ne kadar az paraya çözersen o kadar çok yıldız kazan.
(function () {
  // İzometrik (SimCity tarzı) döşeme boyutları — klasik 2:1 oranı.
  const TILE_W = 48;
  const TILE_H = 24;
  const EMPTY = 0;
  const BUILDING = 1;
  const SPAWN = 2;
  const DEST = 3;

  const ROAD_TYPES = {
    normal: { cost: 10, capacity: 1, color: '#5b6472', edge: '#3f4652' },
    avenue: { cost: 25, capacity: 3, color: '#d9a441', edge: '#a97a26' },
  };

  const BUILDING_PALETTE = [
    { top: '#8b95a8', left: '#565f6f', right: '#6c7688' },
    { top: '#9aa3b5', left: '#5f6878', right: '#767f92' },
    { top: '#a3ade0', left: '#666fa0', right: '#7d87bb' },
    { top: '#8fa8a0', left: '#546862', right: '#688079' },
  ];

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
  const rotateBtn = document.getElementById('rotateBtn');
  const modeBadge = document.getElementById('modeBadge');

  levelTitle.textContent = `Seviye 1 · ${level.name}`;
  levelGoalText.textContent = level.goalText;

  const BUILDING_HEIGHT = 26;
  // Genişlik/yükseklik toplamı (rows+cols) döndürmede değişmediği için canvas boyutu sabit kalabilir.
  canvas.width = (level.cols + level.rows) * (TILE_W / 2) + TILE_W;
  canvas.height = (level.cols + level.rows) * (TILE_H / 2) + TILE_H + BUILDING_HEIGHT + 24;

  // ---- Kamera döndürme (0=0°, 1=90°, 2=180°, 3=270°) ----
  let rotation = 0;

  function rotateRC(r, c) {
    switch (rotation) {
      case 1: return { dr: c, dc: level.rows - 1 - r };
      case 2: return { dr: level.rows - 1 - r, dc: level.cols - 1 - c };
      case 3: return { dr: level.cols - 1 - c, dc: r };
      default: return { dr: r, dc: c };
    }
  }

  function unrotateRC(dr, dc) {
    switch (rotation) {
      case 1: return { r: level.rows - 1 - dc, c: dr };
      case 2: return { r: level.rows - 1 - dr, c: level.cols - 1 - dc };
      case 3: return { r: dc, c: level.cols - 1 - dr };
      default: return { r: dr, c: dc };
    }
  }

  function effRows() {
    return rotation % 2 === 0 ? level.rows : level.cols;
  }

  function isoCenter(r, c) {
    const { dr, dc } = rotateRC(r, c);
    const originX = effRows() * (TILE_W / 2) + TILE_W / 2;
    const originY = TILE_H;
    return {
      x: originX + (dc - dr) * (TILE_W / 2),
      y: originY + (dc + dr) * (TILE_H / 2),
    };
  }

  function screenToTile(px, py) {
    const originX = effRows() * (TILE_W / 2) + TILE_W / 2;
    const originY = TILE_H;
    const dx = px - originX;
    const dy = py - originY;
    const a = dx / (TILE_W / 2); // dc - dr
    const b = dy / (TILE_H / 2); // dc + dr
    const dc = Math.round((a + b) / 2);
    const dr = Math.round((b - a) / 2);
    return unrotateRC(dr, dc);
  }

  function paletteFor(r, c) {
    return BUILDING_PALETTE[(r * 31 + c * 17) % BUILDING_PALETTE.length];
  }

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
  let viewMode = 'blueprint'; // 'blueprint' (yapım) | 'render' (deneme)

  function setViewMode(mode) {
    viewMode = mode;
    modeBadge.textContent = mode === 'render' ? 'DENEME MODU' : 'YAPIM MODU';
    modeBadge.classList.toggle('render', mode === 'render');
    draw();
  }

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

  // ---- Çizim (izometrik) ----
  function diamondPath(cx, cy, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy);
    ctx.closePath();
  }

  function drawGroundTile(r, c) {
    const { x, y } = isoCenter(r, c);
    const t = level.grid[r][c];
    const road = roads.get(key(r, c));

    let fill = ((r + c) % 2 === 0) ? '#274b1f' : '#2d5323';
    if (road) fill = ROAD_TYPES[road.type].color;

    diamondPath(x, y, TILE_W, TILE_H);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = road ? ROAD_TYPES[road.type].edge : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (road) {
      // basit şerit çizgisi
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = road.type === 'avenue' ? 2.5 : 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x - TILE_W / 4, y - TILE_H / 4);
      ctx.lineTo(x + TILE_W / 4, y + TILE_H / 4);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (t === SPAWN) drawBlock(x, y, TILE_W * 0.62, TILE_H * 0.62, 16, { top: '#4ade80', left: '#15803d', right: '#22c55e' });
    if (t === DEST) drawBlock(x, y, TILE_W * 0.62, TILE_H * 0.62, 22, { top: '#38bdf8', left: '#0369a1', right: '#0ea5e9' });
  }

  function drawBlock(cx, cy, w, h, height, colors) {
    const topCy = cy - height;
    // sağ yüz
    ctx.beginPath();
    ctx.moveTo(cx, cy + h / 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx + w / 2, topCy);
    ctx.lineTo(cx, topCy + h / 2);
    ctx.closePath();
    ctx.fillStyle = colors.right;
    ctx.fill();

    // sol yüz
    ctx.beginPath();
    ctx.moveTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy);
    ctx.lineTo(cx - w / 2, topCy);
    ctx.lineTo(cx, topCy + h / 2);
    ctx.closePath();
    ctx.fillStyle = colors.left;
    ctx.fill();

    // çatı
    diamondPath(cx, topCy, w, h);
    ctx.fillStyle = colors.top;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function draw() {
    if (viewMode === 'render') {
      drawRender();
    } else {
      drawBlueprint();
    }
  }

  function drawRender() {
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // zemin karoları (arka plandan öne, r+c artan sırayla)
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        if (level.grid[r][c] !== BUILDING) drawGroundTile(r, c);
      }
    }

    // binalar — derinlik sırasına göre (r+c artan), böylece öndeki bina arkadakini doğru kapatır
    const buildings = [];
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        if (level.grid[r][c] === BUILDING) buildings.push({ r, c });
      }
    }
    buildings.sort((a, b) => a.r + a.c - (b.r + b.c));
    buildings.forEach(({ r, c }) => {
      const { x, y } = isoCenter(r, c);
      const pal = paletteFor(r, c);
      drawBlock(x, y, TILE_W * 0.96, TILE_H * 0.96, BUILDING_HEIGHT, pal);
    });

    // arabalar
    cars.forEach((car) => drawCar(car));
  }

  // ---- Çizim (yapım modu — mimari plan/blueprint) ----
  function drawHatchedDiamond(cx, cy, w, h, strokeColor) {
    ctx.save();
    diamondPath(cx, cy, w, h);
    ctx.clip();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 + i * 10, cy - h);
      ctx.lineTo(cx - w / 2 + i * 10 + h * 2, cy + h);
      ctx.stroke();
    }
    ctx.restore();
    diamondPath(cx, cy, w, h);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  function drawBlueprint() {
    ctx.fillStyle = '#0a1a30';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        const { x, y } = isoCenter(r, c);
        const t = level.grid[r][c];

        if (t === BUILDING) {
          drawHatchedDiamond(x, y, TILE_W, TILE_H, 'rgba(148, 197, 235, 0.35)');
          continue;
        }

        const road = roads.get(key(r, c));
        diamondPath(x, y, TILE_W, TILE_H);
        ctx.fillStyle = road ? 'rgba(56, 189, 248, 0.16)' : 'rgba(148, 197, 235, 0.035)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 197, 235, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (road) {
          const def = ROAD_TYPES[road.type];
          ctx.strokeStyle = road.type === 'avenue' ? '#fbbf24' : '#7dd3fc';
          ctx.lineWidth = road.type === 'avenue' ? 3 : 1.75;
          ctx.beginPath();
          ctx.moveTo(x - TILE_W / 2.4, y - TILE_H / 2.4);
          ctx.lineTo(x + TILE_W / 2.4, y + TILE_H / 2.4);
          ctx.stroke();
        }

        if (t === SPAWN) drawBlueprintLabel(x, y, 'EV', '#4ade80');
        if (t === DEST) drawBlueprintLabel(x, y, 'İŞ', '#38bdf8');
      }
    }

    // Parmağın/imlecin şu an tam hangi kareye denk geldiğini gösteren canlı işaretçi.
    if (hoverTile && tileType(hoverTile.r, hoverTile.c) !== null && tileType(hoverTile.r, hoverTile.c) !== BUILDING) {
      const { x, y } = isoCenter(hoverTile.r, hoverTile.c);
      const isErasePreview =
        (currentTool === 'erase' || roads.has(key(hoverTile.r, hoverTile.c))) && roads.has(key(hoverTile.r, hoverTile.c));
      diamondPath(x, y, TILE_W * 1.06, TILE_H * 1.06);
      ctx.strokeStyle = isErasePreview ? '#f87171' : '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  function drawBlueprintLabel(x, y, text, color) {
    diamondPath(x, y, TILE_W * 0.78, TILE_H * 0.78);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '700 11px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
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

  function drawCar(car) {
    const now = performance.now();
    const from = isoCenter(car.r, car.c);
    let x = from.x;
    let y = from.y;
    if (car.movingTo) {
      const to = isoCenter(car.movingTo.r, car.movingTo.c);
      const t = Math.min(1, (now - car.moveStartedAt) / level.moveDurationMs);
      x = from.x + (to.x - from.x) * t;
      y = from.y + (to.y - from.y) * t;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    diamondPath(x, y + 3, 14, 7);
    ctx.fill();
    ctx.fillStyle = car.done ? '#22c55e' : '#f8fafc';
    roundRect(x - 6, y - 7, 12, 8, 3);
    ctx.fill();
  }

  // ---- Girdi: sürükleyerek yol çizme ----
  function pointToTile(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (evt.clientX - rect.left) * scaleX;
    const py = (evt.clientY - rect.top) * scaleY;
    return screenToTile(px, py);
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

  // İki kare arasındaki tüm ara kareleri döndürür (Bresenham) — hızlı sürüklemede
  // parmağın/imlecin atladığı karelerde boşluk kalmasını önler.
  function lineTiles(r0, c0, r1, c1) {
    const tiles = [];
    let dr = Math.abs(r1 - r0);
    let dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = dr - dc;
    let r = r0;
    let c = c0;
    while (true) {
      tiles.push({ r, c });
      if (r === r1 && c === c1) break;
      const e2 = 2 * err;
      if (e2 > -dc) {
        err -= dc;
        r += sr;
      }
      if (e2 < dr) {
        err += dr;
        c += sc;
      }
    }
    return tiles;
  }

  let pressTimer = null;
  let pressTileKey = null;
  let lastPaintedTile = null;
  let hoverTile = null;
  const LONG_PRESS_ERASE_MS = 450;

  function clearPressTimer() {
    clearTimeout(pressTimer);
    pressTimer = null;
    pressTileKey = null;
  }

  function eraseTileIfRoad(r, c) {
    const k = key(r, c);
    if (roads.has(k)) {
      roads.delete(k);
      recomputeMoney();
    }
    draw();
  }

  function handleDown(evt) {
    if (testing) return;
    const { r, c } = pointToTile(evt);
    hoverTile = { r, c };
    const existing = roads.get(key(r, c));

    if (currentTool !== 'erase' && existing && existing.type === currentTool) {
      // Bu karede zaten aynı tip yol var; tek dokunuş bir şey değiştirmez ama
      // basılı tutarsan siler (uzun basma = sil, tıpkı parkur işaretlerinde olduğu gibi).
      painting = false;
      pressTileKey = key(r, c);
      pressTimer = setTimeout(() => {
        if (pressTileKey === key(r, c)) eraseTileIfRoad(r, c);
        pressTimer = null;
      }, LONG_PRESS_ERASE_MS);
    } else {
      painting = true;
      applyToolAt(r, c);
    }
    lastPaintedTile = { r, c };
    draw();
  }

  function handleMove(evt) {
    if (testing) return;
    const { r, c } = pointToTile(evt);
    hoverTile = { r, c };

    if (pressTimer && pressTileKey !== key(r, c)) {
      // Basılı tutulan kareden ayrıldı — silme iptal, sürükleyerek çizmeye devam.
      clearPressTimer();
      painting = true;
    }

    if (!painting) {
      draw();
      return;
    }

    if (lastPaintedTile) {
      lineTiles(lastPaintedTile.r, lastPaintedTile.c, r, c).forEach((t) => applyToolAt(t.r, t.c));
    } else {
      applyToolAt(r, c);
    }
    lastPaintedTile = { r, c };
  }

  function handleUp() {
    clearPressTimer();
    painting = false;
    lastPaintedTile = null;
    hoverTile = null;
    draw();
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
    setViewMode('render');
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
    setViewMode('blueprint');
  });

  testBtn.addEventListener('click', startTest);

  rotateBtn.addEventListener('click', () => {
    rotation = (rotation + 1) % 4;
    draw();
  });

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
  setViewMode('blueprint');
})();
