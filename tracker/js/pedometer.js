// DeviceMotion tabanlı basit adım sayacı (tepe-vadi / eşik geçişi algoritması).
const Pedometer = (() => {
  let listening = false;
  let onStepCb = null;

  let baseline = 9.8; // yerçekimi + yavaş sürüklenme ortalaması
  const EMA_ALPHA = 0.12;
  const PEAK_THRESHOLD = 1.15; // m/s² sapma eşiği
  const RESET_THRESHOLD = 0.35;
  const MIN_STEP_INTERVAL_MS = 280;

  let inPeak = false;
  let lastStepAt = 0;

  function isSupported() {
    return typeof DeviceMotionEvent !== 'undefined';
  }

  function needsPermission() {
    return typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
  }

  // iOS'ta hareket sensörü izni bir kullanıcı etkileşimi (tap) içinden istenmelidir.
  function requestPermission() {
    if (!isSupported()) return Promise.resolve('unsupported');
    if (needsPermission()) return DeviceMotionEvent.requestPermission();
    return Promise.resolve('granted');
  }

  function handleMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null) return;
    const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    baseline = baseline * (1 - EMA_ALPHA) + magnitude * EMA_ALPHA;
    const deviation = magnitude - baseline;
    const now = Date.now();

    if (!inPeak && deviation > PEAK_THRESHOLD && now - lastStepAt > MIN_STEP_INTERVAL_MS) {
      inPeak = true;
      lastStepAt = now;
      onStepCb && onStepCb();
    } else if (inPeak && deviation < RESET_THRESHOLD) {
      inPeak = false;
    }
  }

  function start(onStep) {
    if (listening) return;
    onStepCb = onStep;
    baseline = 9.8;
    inPeak = false;
    lastStepAt = 0;
    window.addEventListener('devicemotion', handleMotion);
    listening = true;
  }

  function stop() {
    if (!listening) return;
    window.removeEventListener('devicemotion', handleMotion);
    listening = false;
    onStepCb = null;
  }

  return { isSupported, needsPermission, requestPermission, start, stop };
})();
