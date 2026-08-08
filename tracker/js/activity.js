// Aktivite takip motoru: süre, mesafe, tempo, kalori, tur sayımı.
function createActivityTracker(opts) {
  const {
    mapView,
    minAccuracyM = 30,
    maxSpeedMs = 8, // GPS sıçramalarını filtrelemek için üst hız sınırı (~28.8 km/h)
    lapRadiusM = 18,
    onTick,
    onLap,
    onError,
  } = opts;

  let state = 'idle'; // idle | tracking | paused | finished
  let mode = 'free'; // free | route
  let route = null;

  let watchId = null;
  let tickInterval = null;

  let startedAt = null;
  let elapsedMsBeforePause = 0;
  let lastResumeTs = null;

  let distanceM = 0;
  let lastAcceptedPoint = null; // {lat,lng,t}
  let paceWindow = []; // son kabul edilen noktalar {lat,lng,t}
  let steps = 0;
  let laps = 0;
  let lapArmed = false;
  let altitudeSum = 0;
  let altitudeCount = 0;

  function reset() {
    state = 'idle';
    mode = 'free';
    route = null;
    startedAt = null;
    elapsedMsBeforePause = 0;
    lastResumeTs = null;
    distanceM = 0;
    lastAcceptedPoint = null;
    paceWindow = [];
    steps = 0;
    laps = 0;
    lapArmed = false;
    altitudeSum = 0;
    altitudeCount = 0;
  }

  function start(startMode, startRoute) {
    reset();
    mode = startMode || 'free';
    route = startRoute || null;
    state = 'tracking';
    startedAt = Date.now();
    lastResumeTs = startedAt;

    mapView.resetLiveTrail();
    if (mode === 'route' && route) {
      mapView.drawRoute(route.points);
    } else {
      mapView.clearRoute();
    }

    watchId = Geo.watch(handlePosition, handleError, {});
    tickInterval = setInterval(() => {
      onTick && onTick(getSnapshot());
    }, 1000);
  }

  function pause() {
    if (state !== 'tracking') return;
    state = 'paused';
    elapsedMsBeforePause += Date.now() - lastResumeTs;
    if (watchId !== null) {
      Geo.clearWatch(watchId);
      watchId = null;
    }
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'tracking';
    lastResumeTs = Date.now();
    watchId = Geo.watch(handlePosition, handleError, {});
  }

  function stop() {
    if (state === 'idle') return null;
    if (state === 'tracking') {
      elapsedMsBeforePause += Date.now() - lastResumeTs;
    }
    state = 'finished';
    if (watchId !== null) {
      Geo.clearWatch(watchId);
      watchId = null;
    }
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    const summary = getSnapshot();
    summary.startedAt = startedAt;
    summary.endedAt = Date.now();
    return summary;
  }

  function addSteps(n) {
    steps += n;
  }

  function handleError(err) {
    onError && onError(Geo.errorMessage(err));
  }

  function handlePosition(pos) {
    const { latitude: lat, longitude: lng, accuracy, altitude, altitudeAccuracy } = pos.coords;
    const t = pos.timestamp || Date.now();

    mapView.setUserLocation(lat, lng, accuracy, true);

    // İrtifa (tahmini): iOS barometre ile desteklediği için genelde makul, ama yine de
    // gürültülü okumaları ayıklamak için bir doğruluk eşiği uyguluyoruz.
    if (altitude !== null && altitude !== undefined && (!altitudeAccuracy || altitudeAccuracy <= 25)) {
      altitudeSum += altitude;
      altitudeCount += 1;
    }

    if (accuracy && accuracy > minAccuracyM) {
      return; // çok gürültülü, mesafeye katma
    }

    const point = { lat, lng, t };

    if (!lastAcceptedPoint) {
      lastAcceptedPoint = point;
      paceWindow.push(point);
      mapView.addTrailPoint(lat, lng);
      checkLap(point);
      return;
    }

    const deltaM = Geo.haversineMeters(lastAcceptedPoint, point);
    const dtS = Math.max(0.001, (t - lastAcceptedPoint.t) / 1000);
    const impliedSpeed = deltaM / dtS;

    if (deltaM < 1.2) {
      return; // GPS titremesi, hareket yok say
    }
    if (impliedSpeed > maxSpeedMs) {
      return; // gerçekçi olmayan sıçrama
    }

    distanceM += deltaM;
    lastAcceptedPoint = point;
    mapView.addTrailPoint(lat, lng);

    paceWindow.push(point);
    const cutoff = t - 30000;
    paceWindow = paceWindow.filter((p) => p.t >= cutoff);

    checkLap(point);
  }

  function checkLap(point) {
    if (mode !== 'route' || !route || !route.points || route.points.length === 0) return;
    const startPoint = route.points[0];
    const d = Geo.haversineMeters(startPoint, point);

    if (!lapArmed) {
      if (d > lapRadiusM * 1.6) {
        lapArmed = true;
      }
      return;
    }

    if (d <= lapRadiusM) {
      laps += 1;
      lapArmed = false;
      onLap && onLap(laps);
    }
  }

  function getElapsedMs() {
    if (state === 'tracking') {
      return elapsedMsBeforePause + (Date.now() - lastResumeTs);
    }
    return elapsedMsBeforePause;
  }

  function getInstantPaceSecPerKm() {
    if (paceWindow.length < 2) return null;
    const first = paceWindow[0];
    const last = paceWindow[paceWindow.length - 1];
    const dtS = (last.t - first.t) / 1000;
    if (dtS < 5) return null;
    let dist = 0;
    for (let i = 1; i < paceWindow.length; i++) {
      dist += Geo.haversineMeters(paceWindow[i - 1], paceWindow[i]);
    }
    if (dist < 3) return null;
    const speedMs = dist / dtS;
    if (speedMs <= 0) return null;
    return 1000 / speedMs; // saniye/km
  }

  function getAvgPaceSecPerKm() {
    const km = distanceM / 1000;
    if (km <= 0.01) return null;
    const elapsedS = getElapsedMs() / 1000;
    return elapsedS / km;
  }

  function metForSpeedKmh(kmh) {
    if (kmh <= 0) return 1.3;
    if (kmh < 4) return 2.8;
    if (kmh < 5.5) return 3.5;
    if (kmh < 6.5) return 4.3;
    if (kmh < 8) return 6.0;
    if (kmh < 9.7) return 8.3;
    if (kmh < 11) return 9.8;
    if (kmh < 12.5) return 11.0;
    if (kmh < 14) return 12.8;
    return 14.5;
  }

  function getCalories(weightKg) {
    const hours = getElapsedMs() / 3600000;
    if (hours <= 0) return 0;
    const kmh = distanceM / 1000 / hours;
    const met = metForSpeedKmh(kmh);
    return met * (weightKg || 70) * hours;
  }

  function getAvgAltitudeM() {
    if (altitudeCount === 0) return null;
    return altitudeSum / altitudeCount;
  }

  function getSnapshot() {
    return {
      state,
      mode,
      route,
      distanceM,
      distanceKm: distanceM / 1000,
      elapsedMs: getElapsedMs(),
      instantPaceSecPerKm: getInstantPaceSecPerKm(),
      avgPaceSecPerKm: getAvgPaceSecPerKm(),
      avgAltitudeM: getAvgAltitudeM(),
      steps,
      laps,
    };
  }

  return {
    start,
    pause,
    resume,
    stop,
    addSteps,
    getSnapshot,
    get state() {
      return state;
    },
  };
}
