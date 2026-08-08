// Leaflet harita sarmalayıcısı.
function createMapView(containerId) {
  const map = L.map(containerId, {
    zoomControl: true,
    attributionControl: true,
  }).setView([41.015137, 28.97953], 15); // İstanbul varsayılan, konum gelince güncellenecek.

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap katkıda bulunanlar',
  }).addTo(map);

  let userMarker = null;
  let accuracyCircle = null;
  let livePath = null;
  let livePathLatLngs = [];
  let routeLine = null;
  let startMarker = null;
  let hasCentered = false;

  const userIcon = L.divIcon({
    className: 'user-marker',
    html: '<div class="user-marker-dot"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  function setUserLocation(lat, lng, accuracy, autoCenter) {
    const latlng = [lat, lng];
    if (!userMarker) {
      userMarker = L.marker(latlng, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarker.setLatLng(latlng);
    }

    if (accuracy) {
      if (!accuracyCircle) {
        accuracyCircle = L.circle(latlng, {
          radius: accuracy,
          color: '#0ea5e9',
          fillColor: '#0ea5e9',
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(map);
      } else {
        accuracyCircle.setLatLng(latlng);
        accuracyCircle.setRadius(accuracy);
      }
    }

    if (autoCenter || !hasCentered) {
      map.setView(latlng, Math.max(map.getZoom(), 17), { animate: true });
      hasCentered = true;
    }
  }

  function resetLiveTrail() {
    livePathLatLngs = [];
    if (livePath) {
      map.removeLayer(livePath);
      livePath = null;
    }
  }

  function addTrailPoint(lat, lng) {
    livePathLatLngs.push([lat, lng]);
    if (!livePath) {
      livePath = L.polyline(livePathLatLngs, { color: '#22c55e', weight: 4, opacity: 0.85 }).addTo(map);
    } else {
      livePath.setLatLngs(livePathLatLngs);
    }
  }

  function drawRoute(points) {
    clearRoute();
    if (!points || points.length < 2) return;
    const latlngs = points.map((p) => [p.lat, p.lng]);
    routeLine = L.polyline(latlngs, {
      color: '#818cf8',
      weight: 5,
      opacity: 0.75,
      dashArray: '2 10',
      lineCap: 'round',
    }).addTo(map);

    startMarker = L.circleMarker(latlngs[0], {
      radius: 9,
      color: '#facc15',
      fillColor: '#facc15',
      fillOpacity: 0.9,
      weight: 2,
    }).addTo(map);

    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  }

  function clearRoute() {
    if (routeLine) {
      map.removeLayer(routeLine);
      routeLine = null;
    }
    if (startMarker) {
      map.removeLayer(startMarker);
      startMarker = null;
    }
  }

  function invalidateSize() {
    setTimeout(() => map.invalidateSize(), 80);
  }

  return {
    map,
    setUserLocation,
    resetLiveTrail,
    addTrailPoint,
    drawRoute,
    clearRoute,
    invalidateSize,
  };
}
