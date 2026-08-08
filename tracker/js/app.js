// Uygulama denetleyicisi: sekmeler, izinler, aktivite başlat/durdur akışı.
(function () {
  const settings = Storage.getSettings();

  const els = {
    tabBtns: document.querySelectorAll('.tab-btn'),
    screens: {
      home: document.getElementById('screen-home'),
      routes: document.getElementById('screen-routes'),
      history: document.getElementById('screen-history'),
    },
    topbarTitle: document.getElementById('topbarTitle'),

    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    stopBtn: document.getElementById('stopBtn'),
    homeHint: document.getElementById('homeHint'),

    routeBanner: document.getElementById('routeBanner'),
    routeBannerName: document.getElementById('routeBannerName'),
    clearSelectedRouteBtn: document.getElementById('clearSelectedRouteBtn'),

    statDuration: document.getElementById('statDuration'),
    statDistance: document.getElementById('statDistance'),
    statPace: document.getElementById('statPace'),
    statAvgPace: document.getElementById('statAvgPace'),
    statCalories: document.getElementById('statCalories'),
    statSteps: document.getElementById('statSteps'),
    statLaps: document.getElementById('statLaps'),

    locationPermOverlay: document.getElementById('locationPermOverlay'),
    grantLocationBtn: document.getElementById('grantLocationBtn'),

    settingsBtn: document.getElementById('settingsBtn'),
    settingsOverlay: document.getElementById('settingsOverlay'),
    weightInput: document.getElementById('weightInput'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),

    toast: document.getElementById('toast'),
  };

  const tabLabels = { home: 'Ana Ekran', routes: 'Parkurlar', history: 'Geçmiş' };

  let toastTimer = null;
  function showToast(msg, duration) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), duration || 3200);
  }
  window.AppToast = showToast;

  // GPS sinyali zayıfken watchPosition sürekli hata üretebilir; aynı mesajla spam'i önle.
  let lastGeoErrorAt = 0;
  window.AppGeoErrorToast = function (msg) {
    const now = Date.now();
    if (now - lastGeoErrorAt < 6000) return;
    lastGeoErrorAt = now;
    showToast(msg);
  };

  // ---- Sekmeler ----
  function switchTab(name) {
    Object.entries(els.screens).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
    els.tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === name));
    els.topbarTitle.textContent = tabLabels[name] || '';
    if (name === 'home') {
      mapView.invalidateSize();
    }
    document.dispatchEvent(new CustomEvent('tab:show', { detail: { tab: name } }));
  }

  els.tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ---- Harita ----
  const mapView = createMapView('map');
  window.AppMapView = mapView;

  // ---- Ayarlar ----
  els.weightInput.value = settings.weightKg || 70;
  els.settingsBtn.addEventListener('click', () => {
    els.weightInput.value = Storage.getSettings().weightKg || 70;
    els.settingsOverlay.classList.add('active');
  });
  els.closeSettingsBtn.addEventListener('click', () => els.settingsOverlay.classList.remove('active'));
  els.saveSettingsBtn.addEventListener('click', () => {
    const weightKg = Math.max(30, Math.min(250, parseFloat(els.weightInput.value) || 70));
    Storage.saveSettings({ ...Storage.getSettings(), weightKg });
    els.settingsOverlay.classList.remove('active');
    showToast('Ayarlar kaydedildi.');
  });

  // ---- Konum izni ----
  let hasLocationFix = false;

  function showLocationPermOverlay() {
    els.locationPermOverlay.classList.add('active');
  }
  function hideLocationPermOverlay() {
    els.locationPermOverlay.classList.remove('active');
  }

  function tryInitialFix() {
    if (!Geo.isSupported()) {
      showToast('Bu cihaz konum servisini desteklemiyor.');
      return;
    }
    Geo.requestOnce()
      .then((pos) => {
        hasLocationFix = true;
        hideLocationPermOverlay();
        mapView.setUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true);
      })
      .catch((err) => {
        if (err && err.code === 1) {
          showLocationPermOverlay();
        } else {
          showToast(Geo.errorMessage(err));
        }
      });
  }

  els.grantLocationBtn.addEventListener('click', tryInitialFix);

  // ---- Aktivite takibi ----
  let selectedRoute = null;

  const tracker = createActivityTracker({
    mapView,
    onTick: renderSnapshot,
    onLap: (count) => {
      showToast(`Tur tamamlandı: ${count}`);
    },
    onError: (msg) => window.AppGeoErrorToast(msg),
  });
  window.AppTracker = tracker;

  function renderSnapshot(snap) {
    els.statDuration.textContent = Fmt.duration(snap.elapsedMs);
    els.statDistance.textContent = Fmt.km(snap.distanceM);
    els.statPace.textContent = Fmt.pace(snap.instantPaceSecPerKm);
    els.statAvgPace.textContent = Fmt.pace(snap.avgPaceSecPerKm);
    els.statCalories.textContent = Fmt.kcal(tracker.getSnapshot ? calcCalories(snap) : 0);
    els.statSteps.textContent = snap.steps;
    els.statLaps.textContent = snap.laps;
  }

  function calcCalories(snap) {
    const w = Storage.getSettings().weightKg || 70;
    const hours = snap.elapsedMs / 3600000;
    if (hours <= 0) return 0;
    const kmh = snap.distanceKm / hours;
    const met = kmh <= 0 ? 1.3 : kmh < 4 ? 2.8 : kmh < 5.5 ? 3.5 : kmh < 6.5 ? 4.3 : kmh < 8 ? 6.0 : kmh < 9.7 ? 8.3 : kmh < 11 ? 9.8 : kmh < 12.5 ? 11.0 : kmh < 14 ? 12.8 : 14.5;
    return met * w * hours;
  }

  function setControlsState(state) {
    els.startBtn.style.display = state === 'idle' || state === 'finished' ? '' : 'none';
    els.pauseBtn.style.display = state === 'tracking' ? '' : 'none';
    els.resumeBtn.style.display = state === 'paused' ? '' : 'none';
    els.stopBtn.style.display = state === 'tracking' || state === 'paused' ? '' : 'none';
    els.homeHint.style.display = state === 'idle' ? '' : 'none';
  }

  function doStart() {
    if (!Geo.isSupported()) {
      showToast('Bu cihaz konum servisini desteklemiyor.');
      return;
    }
    Geo.requestOnce()
      .then(() => {
        hasLocationFix = true;
        hideLocationPermOverlay();
        tracker.start(selectedRoute ? 'route' : 'free', selectedRoute);
        setControlsState('tracking');
        renderSnapshot(tracker.getSnapshot());
      })
      .catch((err) => {
        if (err && err.code === 1) {
          showLocationPermOverlay();
        } else {
          showToast(Geo.errorMessage(err));
        }
      });
  }

  els.startBtn.addEventListener('click', doStart);

  els.pauseBtn.addEventListener('click', () => {
    tracker.pause();
    setControlsState('paused');
  });

  els.resumeBtn.addEventListener('click', () => {
    tracker.resume();
    setControlsState('tracking');
  });

  els.stopBtn.addEventListener('click', () => {
    const summary = tracker.stop();
    setControlsState('finished');
    if (summary && summary.distanceM > 5) {
      showToast(`Antrenman tamamlandı: ${Fmt.km(summary.distanceM)} km`);
    }
    setControlsState('idle');
    selectedRoute = null;
    els.routeBanner.style.display = 'none';
    mapView.clearRoute();
  });

  els.clearSelectedRouteBtn.addEventListener('click', () => {
    selectedRoute = null;
    els.routeBanner.style.display = 'none';
    mapView.clearRoute();
  });

  // Dışarıdan (Parkurlar sekmesi) bir parkur seçildiğinde çağrılır.
  window.AppSelectRoute = function (route) {
    selectedRoute = route;
    els.routeBannerName.textContent = route.name;
    els.routeBanner.style.display = 'flex';
    switchTab('home');
    mapView.drawRoute(route.points);
    showToast(`"${route.name}" seçildi. Başla'ya bas.`);
  };

  setControlsState('idle');
  tryInitialFix();

  // ---- Service worker ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW kayıt hatası', err));
    });
  }
})();
