// Parkur oluşturma (yürüyerek veya haritada çizerek), listeleme, seçme ve silme.
(function () {
  let routeMapView = null;
  let watchId = null;
  let recordedPoints = [];
  let recordStartedAt = null;
  let recordTickInterval = null;
  let pendingRouteToSave = null;

  let drawMapView = null;
  let draftWaypoints = []; // kullanıcının haritaya dokunarak eklediği işaretler
  let draftPath = []; // çizilecek/kaydedilecek gerçek yol (yola oturmuşsa OSRM'den gelir)
  let draftMarkersLayer = null;
  let draftPolyline = null;
  let drawClickHandler = null;
  let roadSnapFetchToken = 0;

  const OSRM_FOOT_URL = 'https://router.project-osrm.org/route/v1/foot/';

  const els = {
    routesListWrap: document.getElementById('routesListWrap'),
    routesList: document.getElementById('routesList'),
    newRouteBtn: document.getElementById('newRouteBtn'),
    drawRouteBtn: document.getElementById('drawRouteBtn'),

    routeRecordWrap: document.getElementById('routeRecordWrap'),
    routeRecDistance: document.getElementById('routeRecDistance'),
    routeRecDuration: document.getElementById('routeRecDuration'),
    cancelRouteBtn: document.getElementById('cancelRouteBtn'),
    finishRouteBtn: document.getElementById('finishRouteBtn'),

    routeDrawWrap: document.getElementById('routeDrawWrap'),
    drawDistance: document.getElementById('drawDistance'),
    drawPointCount: document.getElementById('drawPointCount'),
    drawRoadStatus: document.getElementById('drawRoadStatus'),
    roadSnapToggle: document.getElementById('roadSnapToggle'),
    undoDrawPointBtn: document.getElementById('undoDrawPointBtn'),
    clearDrawBtn: document.getElementById('clearDrawBtn'),
    cancelDrawBtn: document.getElementById('cancelDrawBtn'),
    finishDrawBtn: document.getElementById('finishDrawBtn'),

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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function openRouteNameModal(points) {
    pendingRouteToSave = points;
    els.routeNameInput.value = '';
    els.routeNameOverlay.classList.add('active');
  }

  function renderRouteList() {
    const routes = Storage.getRoutes();
    if (routes.length === 0) {
      els.routesList.innerHTML = `
        <div class="empty-state">
          <div class="big">🛣️</div>
          <p>Henüz kayıtlı parkurun yok. Yürüyerek kaydet ya da haritada çizerek ilk parkurunu oluştur.</p>
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

  // ---- Yürüyerek kaydet (GPS) ----
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

    openRouteNameModal(recordedPoints.slice());
  }

  els.newRouteBtn.addEventListener('click', startRecording);
  els.cancelRouteBtn.addEventListener('click', () => stopRecording(true));
  els.finishRouteBtn.addEventListener('click', () => stopRecording(false));

  // ---- Haritada çizerek oluştur (yürümeden) ----
  function ensureDrawMap() {
    if (!drawMapView) {
      drawMapView = createMapView('drawMap');
    }
    return drawMapView;
  }

  function draftIcon(index, isStart) {
    return L.divIcon({
      className: '',
      html: `<div class="draft-marker${isStart ? ' start' : ''}">${index + 1}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  function setRoadStatus(text) {
    els.drawRoadStatus.textContent = text || '';
  }

  // OSRM (halka açık, ücretsiz yaya rota servisi) ile işaretler arasını gerçek
  // yollara oturtur. İstek başarısız olursa düz çizgiye düşer.
  async function fetchRoadSnappedPath(waypoints) {
    const coordStr = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_FOOT_URL}${coordStr}?overview=full&geometries=geojson`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('osrm_http_' + resp.status);
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) throw new Error('osrm_no_route');
    return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
  }

  function drawMarkersAndPolyline() {
    const map = drawMapView.map;

    if (draftMarkersLayer) {
      map.removeLayer(draftMarkersLayer);
    }
    draftMarkersLayer = L.layerGroup().addTo(map);

    draftWaypoints.forEach((pt, i) => {
      const marker = L.marker([pt.lat, pt.lng], {
        icon: draftIcon(i, i === 0),
        draggable: true,
      });
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        draftWaypoints[i] = { lat: ll.lat, lng: ll.lng };
        updateDraftPath();
      });
      marker.on('click', () => {
        draftWaypoints.splice(i, 1);
        updateDraftPath();
      });
      marker.addTo(draftMarkersLayer);
    });

    if (draftPolyline) {
      map.removeLayer(draftPolyline);
      draftPolyline = null;
    }
    const linePoints = draftPath.length >= 2 ? draftPath : draftWaypoints;
    if (linePoints.length >= 2) {
      draftPolyline = L.polyline(
        linePoints.map((p) => [p.lat, p.lng]),
        { color: '#0ea5e9', weight: 5, opacity: 0.9, dashArray: '1 9', lineCap: 'round' }
      ).addTo(map);
    }

    const distanceSource = draftPath.length >= 2 ? draftPath : draftWaypoints;
    els.drawDistance.textContent = Fmt.km(routeDistanceM(distanceSource));
    els.drawPointCount.textContent = draftWaypoints.length;
  }

  // Her işaret eklendiğinde/taşındığında/silindiğinde çağrılır.
  async function updateDraftPath() {
    const useRoadSnap = els.roadSnapToggle.checked;

    if (draftWaypoints.length < 2 || !useRoadSnap) {
      draftPath = draftWaypoints.slice();
      setRoadStatus('');
      drawMarkersAndPolyline();
      return;
    }

    const myToken = ++roadSnapFetchToken;
    setRoadStatus('Yol hesaplanıyor…');
    drawMarkersAndPolyline();

    try {
      const path = await fetchRoadSnappedPath(draftWaypoints);
      if (myToken !== roadSnapFetchToken) return; // bu arada yeni bir değişiklik oldu
      draftPath = path;
      setRoadStatus('');
    } catch (err) {
      if (myToken !== roadSnapFetchToken) return;
      draftPath = draftWaypoints.slice();
      setRoadStatus('Yol rotası alınamadı, düz çizgi kullanıldı.');
    }
    drawMarkersAndPolyline();
  }

  function startDrawing() {
    els.routesListWrap.style.display = 'none';
    els.routeDrawWrap.style.display = 'block';
    draftWaypoints = [];
    draftPath = [];
    setRoadStatus('');

    ensureDrawMap();
    drawMapView.invalidateSize();
    drawMarkersAndPolyline();

    drawClickHandler = (e) => {
      draftWaypoints.push({ lat: e.latlng.lat, lng: e.latlng.lng });
      updateDraftPath();
    };
    drawMapView.map.on('click', drawClickHandler);

    if (Geo.isSupported()) {
      Geo.requestOnce()
        .then((pos) => {
          drawMapView.setUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true);
        })
        .catch(() => {});
    }
  }

  function stopDrawing() {
    if (drawClickHandler && drawMapView) {
      drawMapView.map.off('click', drawClickHandler);
      drawClickHandler = null;
    }
    els.routeDrawWrap.style.display = 'none';
    els.routesListWrap.style.display = '';
  }

  els.drawRouteBtn.addEventListener('click', startDrawing);

  els.undoDrawPointBtn.addEventListener('click', () => {
    draftWaypoints.pop();
    updateDraftPath();
  });

  els.clearDrawBtn.addEventListener('click', () => {
    draftWaypoints = [];
    draftPath = [];
    setRoadStatus('');
    drawMarkersAndPolyline();
  });

  els.roadSnapToggle.addEventListener('change', () => {
    updateDraftPath();
  });

  els.cancelDrawBtn.addEventListener('click', () => {
    stopDrawing();
    draftWaypoints = [];
    draftPath = [];
  });

  els.finishDrawBtn.addEventListener('click', () => {
    if (draftWaypoints.length < 2) {
      AppToast('En az 2 nokta işaretlemelisin.');
      return;
    }
    const points = (draftPath.length >= 2 ? draftPath : draftWaypoints).slice();
    stopDrawing();
    draftWaypoints = [];
    draftPath = [];
    openRouteNameModal(points);
  });

  // ---- Parkur adı kaydetme (her iki akış için ortak) ----
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
      if (drawMapView) drawMapView.invalidateSize();
    }
  });

  renderRouteList();
})();
