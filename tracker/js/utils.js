// Biçimlendirme yardımcıları.
const Fmt = (() => {
  function duration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }

  function pace(secPerKm) {
    if (secPerKm === null || secPerKm === undefined || !isFinite(secPerKm) || secPerKm <= 0) {
      return '--:--';
    }
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function km(meters) {
    return (meters / 1000).toFixed(2);
  }

  // Ortalama hız (km/sa). secPerKm, Activity.getAvgPaceSecPerKm() ile aynı birimde.
  function speedKmh(secPerKm) {
    if (secPerKm === null || secPerKm === undefined || !isFinite(secPerKm) || secPerKm <= 0) {
      return '-.-';
    }
    return (3600 / secPerKm).toFixed(1);
  }

  function kcal(v) {
    return Math.round(v).toString();
  }

  function dateTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function dateShort(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  return { duration, pace, km, speedKmh, kcal, dateTime, dateShort };
})();
