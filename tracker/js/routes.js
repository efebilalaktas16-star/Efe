// Parkur oluşturma, listeleme, seçme ve silme.
(function () {
  let routeMapView = null;
  let watchId = null;
  let recordedPoints = [];
  let recordStartedAt = null;
  let recordTickInterval = null;
  let pendingRouteToSave = null;

  const els = {
    routesListWrap: document.getElementById('routesListWrap'),
    routesList: document.getElementById('routesList'),
    newRouteBtn: document.getElementById('newRouteBtn'),

    routeRecordWrap: document.getElementById('routeRecordWrap'),
    routeRecDistance: document.getElementById('routeRecDistance'),
    routeRecDuration: document.getElementById('routeRecDuration'),
    routeRecPoints: document.getElementById('routeRecPoints'),
    cancelRouteBtn: document.getElementById('cancelRouteBtn'),
    finishRouteBtn: document.getElementById('finishRouteBtn'),

    routeNameOverlay: document.getElementById('routeNameOverlay'),
    routeNameInput: document.getElementById('routeNameInput'),
    discardRouteBtn: document.getElementById('discardRouteBtn'),
    confirmSaveRouteBtn: document.getElementById('confirmSaveRouteBtn'),
  };

  function routeDistanceM(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += Geo.haversineMeters(points[i - 1], points[i]);
    }
    return d;
  }

  function renderRouteList() {
    const routes = Storage.getRoutes();
    if (routes.length === 0) {
      els.routesList.innerHTML = `
        <div class="empty-state">
          <div class="big">🛣️</div>
          <p>Henüz kayıtlı parkurun yok. "Yeni Parkur Oluştur" ile ilk turunu kaydet.</p>
        </div>`;
      return;
    }

    els.routesList.innerHTML = routes
      .map((r) => {
        const distKm = (routeDistanceM(r.points) / 1000).toFixed(2);
        return `
        <div class="card">
          <div class="card-row">
            <div>
              <h3>${escapeHtml(r.name)}</h3>
              <div class="meta">${Fmt.dateShort(r.createdAt)} · ${distKm} km · ${r.points.length} nokta</div>
            </div>
          </div>
          <div class="controls" style="padding:12px 0 0;">
            <button class="btn btn-primary" data-start-route="${r.id}" type="button">▶ Başla</button>
            <button class="btn btn-secondary" data-delete-route="${r.id}" type="button">🗑 Sil</button>
          </div>
        </div>`;
      })
      .join('');

    els.routesList.querySelectorAll('[data-start-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-start-route');
        const route = Storage.getRoutes().find((r) => r.id === id);
        if (route) window.AppSelectRoute(route);
      });
    });

    els.routesList.querySelectorAll('[data-delete-route]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-route');
        const route = Storage.getRoutes().find((r) => r.id === id);
        if (route && confirm(`"${route.name}" parkurunu silmek istediğine emin misin?`)) {
          Storage.deleteRoute(id);
          renderRouteList();
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Parkur kaydetme akışı ----
  function ensureRouteMap() {
    if (!routeMapView) {
      routeMapView = createMapView('routeMap');
    }
    return routeMapView;
  }

  function startRecording() {
    if (!Geo.isSupported()) {
      AppToast('Bu cihaz konum servisini desteklemiyor.');
      return;
    }
    Geo.requestOnce()
      .then(() => {
        recordedPoints = [];
        recordStartedAt = Date.now();

        els.routesListWrap.style.display = 'none';
        els.routeRecordWrap.style.display = 'block';
        ensureRouteMap().invalidateSize();
        ensureRouteMap().resetLiveTrail();

        watchId = Geo.watch(handleRecordPosition, (err) => window.AppGeoErrorToast(Geo.errorMessage(err)), {});
        recordTickInterval = setInterval(updateRecordStats, 1000);
        updateRecordStats();
      })
      .catch((err) => AppToast(Geo.errorMessage(err)));
  }

  function handleRecordPosition(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    routeMapView.setUserLocation(lat, lng, accuracy, true);

    if (accuracy && accuracy > 30) return;

    const point = { lat, lng };
    const last = recordedPoints[recordedPoints.length - 1];
    if (last) {
      const d = Geo.haversineMeters(last, point);
      if (d < 3) return; // çok küçük hareketleri atla
    }
    recordedPoints.push(point);
    routeMapView.addTrailPoint(lat, lng);
  }

  function updateRecordStats() {
    els.routeRecDistance.textContent = Fmt.km(routeDistanceM(recordedPoints));
    els.routeRecDuration.textContent = Fmt.duration(Date.now() - recordStartedAt);
  }

  function stopRecording(discard) {
    if (watchId !== null) {
      Geo.clearWatch(watchId);
      watchId = null;
    }
    if (recordTickInterval) {
      clearInterval(recordTickInterval);
      recordTickInterval = null;
    }
    els.routeRecordWrap.style.display = 'none';
    els.routesListWrap.style.display = '';

    if (discard) {
      recordedPoints = [];
      return;
    }

    if (recordedPoints.length < 3 || routeDistanceM(recordedPoints) < 15) {
      AppToast('Parkur çok kısa kaydedildi, biraz daha yürüyüp tekrar dene.');
      recordedPoints = [];
      return;
    }

    pendingRouteToSave = recordedPoints.slice();
    els.routeNameInput.value = '';
    els.routeNameOverlay.classList.add('active');
  }

  els.newRouteBtn.addEventListener('click', startRecording);
  els.cancelRouteBtn.addEventListener('click', () => stopRecording(true));
  els.finishRouteBtn.addEventListener('click', () => stopRecording(false));

  els.discardRouteBtn.addEventListener('click', () => {
    pendingRouteToSave = null;
    els.routeNameOverlay.classList.remove('active');
  });

  els.confirmSaveRouteBtn.addEventListener('click', () => {
    const name = els.routeNameInput.value.trim();
    if (!name) {
      AppToast('Lütfen parkura bir isim ver.');
      return;
    }
    if (!pendingRouteToSave) {
      els.routeNameOverlay.classList.remove('active');
      return;
    }
    Storage.saveRoute({
      id: Storage.uid(),
      name,
      points: pendingRouteToSave,
      createdAt: Date.now(),
    });
    pendingRouteToSave = null;
    els.routeNameOverlay.classList.remove('active');
    renderRouteList();
    AppToast('Parkur kaydedildi.');
  });

  document.addEventListener('tab:show', (e) => {
    if (e.detail.tab === 'routes') {
      renderRouteList();
      if (routeMapView) routeMapView.invalidateSize();
    }
  });

  renderRouteList();
})();
