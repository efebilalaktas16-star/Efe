// Konum yardımcıları: Haversine mesafe hesabı + izin/watch yönetimi.
const Geo = (() => {
  const EARTH_RADIUS_M = 6371000;

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  // İki koordinat arasındaki mesafeyi metre cinsinden döndürür.
  function haversineMeters(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_M * c;
  }

  function isSupported() {
    return 'geolocation' in navigator;
  }

  // Tek seferlik konum isteği (izin ekranını tetikler).
  function requestOnce(options) {
    return new Promise((resolve, reject) => {
      if (!isSupported()) {
        reject(new Error('unsupported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
        ...options,
      });
    });
  }

  // Sürekli konum takibi başlatır, watch id döner.
  function watch(onPosition, onError, options) {
    if (!isSupported()) {
      onError && onError(new Error('unsupported'));
      return null;
    }
    return navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 1000,
      ...options,
    });
  }

  function clearWatch(id) {
    if (id !== null && id !== undefined) {
      navigator.geolocation.clearWatch(id);
    }
  }

  function errorMessage(err) {
    if (!err) return 'Bilinmeyen konum hatası.';
    switch (err.code) {
      case 1: // PERMISSION_DENIED
        return 'Konum izni reddedildi. Ayarlar > Safari > Konum üzerinden izin vermen gerekiyor.';
      case 2: // POSITION_UNAVAILABLE
        return 'Konum şu anda alınamıyor. GPS sinyalini kontrol et.';
      case 3: // TIMEOUT
        return 'Konum alma zaman aşımına uğradı. Tekrar deneniyor...';
      default:
        return err.message || 'Konum alınamadı.';
    }
  }

  return { haversineMeters, isSupported, requestOnce, watch, clearWatch, errorMessage };
})();
