// Aktivite sürerken ekranın otomatik kilitlenmesini engeller (Wake Lock API).
// NOT: Bu sadece ekranın kendiliğinden kararıp kilitlenmesini önler. Fiziksel kilit
// tuşuna basmak ya da başka bir uygulamaya geçmek takibi yine de durdurur —
// iOS Safari/PWA'da arka planda GPS takibi desteklenmiyor.
const WakeLock = (() => {
  const supported = 'wakeLock' in navigator;
  let sentinel = null;

  async function request() {
    if (!supported || sentinel) return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch (err) {
      console.warn('Wake Lock alınamadı', err);
    }
  }

  async function release() {
    if (!sentinel) return;
    try {
      await sentinel.release();
    } catch (err) {
      // yoksay
    }
    sentinel = null;
  }

  return { supported, request, release };
})();
