// Aktivite geçmişi kaydı, listesi ve istatistikler (Chart.js).
const HistoryManager = (() => {
  function saveActivity(summary, caloriesValue) {
    const record = {
      id: Storage.uid(),
      startedAt: summary.startedAt,
      endedAt: summary.endedAt,
      durationMs: summary.elapsedMs,
      distanceKm: summary.distanceKm,
      avgPaceSecPerKm: summary.avgPaceSecPerKm,
      avgAltitudeM: summary.avgAltitudeM === null || summary.avgAltitudeM === undefined ? null : summary.avgAltitudeM,
      steps: summary.steps || 0,
      laps: summary.laps || 0,
      routeName: summary.route ? summary.route.name : null,
      calories: Math.round(caloriesValue || 0),
    };
    Storage.saveActivity(record);
    return record;
  }

  return { saveActivity };
})();

(function () {
  const els = {
    historyList: document.getElementById('historyList'),
    histWeekKm: document.getElementById('histWeekKm'),
    histMonthKm: document.getElementById('histMonthKm'),
    histTotalCount: document.getElementById('histTotalCount'),
    histAvgPace: document.getElementById('histAvgPace'),
  };

  let weekChart = null;

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function renderStats(activities) {
    const now = Date.now();
    const todayStart = startOfDay(now);
    const weekAgo = todayStart - 6 * 86400000;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    let weekKm = 0;
    let monthKm = 0;
    let totalPaceWeighted = 0;
    let totalKmForPace = 0;

    activities.forEach((a) => {
      if (a.startedAt >= weekAgo) weekKm += a.distanceKm;
      if (a.startedAt >= monthStart) monthKm += a.distanceKm;
      if (a.avgPaceSecPerKm && a.distanceKm > 0) {
        totalPaceWeighted += a.avgPaceSecPerKm * a.distanceKm;
        totalKmForPace += a.distanceKm;
      }
    });

    els.histWeekKm.textContent = weekKm.toFixed(1);
    els.histMonthKm.textContent = monthKm.toFixed(1);
    els.histTotalCount.textContent = activities.length;

    // Son 7 gün grafiği
    const dayBuckets = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart - i * 86400000;
      dayBuckets.push({ start: dayStart, km: 0 });
    }
    activities.forEach((a) => {
      const bucket = dayBuckets.find((b) => a.startedAt >= b.start && a.startedAt < b.start + 86400000);
      if (bucket) bucket.km += a.distanceKm;
    });

    const labels = dayBuckets.map((b) => new Date(b.start).toLocaleDateString('tr-TR', { weekday: 'short' }));
    const data = dayBuckets.map((b) => Number(b.km.toFixed(2)));

    const canvas = document.getElementById('weekChart');
    if (canvas && window.Chart) {
      if (weekChart) weekChart.destroy();
      weekChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'km',
              data,
              backgroundColor: '#0ea5e9',
              borderRadius: 6,
              maxBarThickness: 34,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
            y: {
              beginAtZero: true,
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(255,255,255,0.06)' },
            },
          },
        },
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderList(activities) {
    if (activities.length === 0) {
      els.historyList.innerHTML = `
        <div class="empty-state">
          <div class="icon" style="width:48px;height:48px;margin:0 auto 10px;color:var(--text-dim)">${Icons.set.chart}</div>
          <p>Henüz kayıtlı antrenmanın yok. Ana Ekran'dan "Başla" diyerek ilk antrenmanını kaydet.</p>
        </div>`;
      return;
    }

    const sorted = activities.slice().sort((a, b) => b.startedAt - a.startedAt);

    els.historyList.innerHTML = sorted
      .map(
        (a) => `
      <div class="card">
        <div class="card-row">
          <div>
            <h3>${escapeHtml(a.routeName || 'Serbest Antrenman')}</h3>
            <div class="meta">${Fmt.dateTime(a.startedAt)}</div>
          </div>
        </div>
        <div class="summary-grid cols-4" style="margin-top:10px; margin-bottom:0;">
          <div class="stat-cell">
            <div class="stat-value">${a.distanceKm.toFixed(2)}</div>
            <div class="stat-label">km</div>
          </div>
          <div class="stat-cell">
            <div class="stat-value">${Fmt.duration(a.durationMs)}</div>
            <div class="stat-label">Süre</div>
          </div>
          <div class="stat-cell">
            <div class="stat-value">${Fmt.pace(a.avgPaceSecPerKm)}</div>
            <div class="stat-label">Tempo</div>
          </div>
          <div class="stat-cell">
            <div class="stat-value">${Fmt.speedKmh(a.avgPaceSecPerKm)}</div>
            <div class="stat-label">km/sa</div>
          </div>
        </div>
        <div class="chip-row" style="justify-content:flex-start;margin-top:10px">
          <div class="chip">${Icons.markup('footprint')}${a.steps} adım</div>
          <div class="chip">${Icons.markup('repeat')}${a.laps} tur</div>
          <div class="chip">${Icons.markup('flame')}${a.calories} kcal</div>
        </div>
        <div class="controls" style="padding:10px 0 0;">
          <button class="btn btn-secondary btn-block" data-delete-activity="${a.id}" type="button">${Icons.markup('trash')}Sil</button>
        </div>
      </div>`
      )
      .join('');

    els.historyList.querySelectorAll('[data-delete-activity]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-activity');
        if (confirm('Bu antrenman kaydını silmek istediğine emin misin?')) {
          Storage.deleteActivity(id);
          renderAll();
        }
      });
    });
  }

  // ---- Günlük özetler ----
  // "Tam 00:00'da" diye bekleyen bir arka plan işi PWA'da güvenilir çalışmaz (telefon
  // kilitliyken/ uygulama kapalıyken JS durur). Bunun yerine her gün, o güne ait
  // kaydedilmiş antrenmanlardan anlık olarak hesaplanır — uygulamayı ne zaman açarsan
  // aç, geçmiş günler zaten sabit, bugünkü özet de o ana kadarki verilerle canlı güncel.
  function computeDaySummaries(activities) {
    const byDay = new Map();
    activities.forEach((a) => {
      const key = startOfDay(a.startedAt);
      if (!byDay.has(key)) {
        byDay.set(key, { dayStart: key, km: 0, ms: 0, kcal: 0, altSum: 0, altCount: 0, count: 0 });
      }
      const d = byDay.get(key);
      d.km += a.distanceKm;
      d.ms += a.durationMs;
      d.kcal += a.calories || 0;
      d.count += 1;
      if (a.avgAltitudeM !== null && a.avgAltitudeM !== undefined) {
        d.altSum += a.avgAltitudeM;
        d.altCount += 1;
      }
    });

    return Array.from(byDay.values())
      .map((d) => ({
        dayStart: d.dayStart,
        totalKm: d.km,
        totalMinutes: d.ms / 60000,
        avgSpeedKmh: d.ms > 0 ? d.km / (d.ms / 3600000) : 0,
        avgAltitudeM: d.altCount > 0 ? d.altSum / d.altCount : null,
        totalCalories: Math.round(d.kcal),
        count: d.count,
      }))
      .sort((a, b) => b.dayStart - a.dayStart);
  }

  function drawDaySummaryCard(day) {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1120;
    const ctx = canvas.getContext('2d');

    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#16233d');
    bgGrad.addColorStop(1, '#0b1220');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 30px -apple-system, system-ui, sans-serif';
    ctx.fillText('KOŞU TAKİP · GÜNLÜK ÖZET', 60, 100);

    ctx.fillStyle = '#f1f5f9';
    ctx.font = '800 46px -apple-system, system-ui, sans-serif';
    const dateLabel = new Date(day.dayStart).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
    });
    ctx.fillText(dateLabel, 60, 170);

    // Hero mesafe
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '800 190px -apple-system, system-ui, sans-serif';
    ctx.fillText(day.totalKm.toFixed(2), 60, 400);
    ctx.fillStyle = '#0ea5e9';
    ctx.font = '700 46px -apple-system, system-ui, sans-serif';
    ctx.fillText('KM', 66, 450);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 32px -apple-system, system-ui, sans-serif';
    ctx.fillText(`${day.count} antrenman`, 60, 500);

    // İstatistik kutuları
    const stats = [
      { label: 'SÜRE', value: Fmt.duration(day.totalMinutes * 60000) },
      { label: 'ORT. HIZ', value: `${day.avgSpeedKmh > 0 ? day.avgSpeedKmh.toFixed(1) : '-.-'} km/sa` },
      { label: 'ORT. İRTİFA', value: day.avgAltitudeM !== null ? `${Math.round(day.avgAltitudeM)} m` : '—' },
      { label: 'TAHMİNİ KALORİ', value: `${day.totalCalories} kcal` },
    ];

    const boxTop = 570;
    const boxH = 190;
    const gap = 24;
    const boxW = (canvas.width - 120 - gap) / 2;
    stats.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 60 + col * (boxW + gap);
      const y = boxTop + row * (boxH + gap);

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, x, y, boxW, boxH, 20);
      ctx.fill();

      ctx.fillStyle = '#f1f5f9';
      ctx.font = '800 54px -apple-system, system-ui, sans-serif';
      ctx.fillText(s.value, x + 30, y + 95);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 26px -apple-system, system-ui, sans-serif';
      ctx.fillText(s.label, x + 30, y + 140);
    });

    ctx.fillStyle = '#475569';
    ctx.font = '500 26px -apple-system, system-ui, sans-serif';
    ctx.fillText('Veriler yalnızca bu telefonda saklanır.', 60, canvas.height - 50);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function downloadDayCard(day) {
    const blob = await drawDaySummaryCard(day);
    if (!blob) {
      AppToast('Görsel oluşturulamadı.');
      return;
    }
    const dateFile = new Date(day.dayStart).toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kosu-takip-${dateFile}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function shareDayCard(day) {
    const blob = await drawDaySummaryCard(day);
    if (!blob) {
      AppToast('Görsel oluşturulamadı.');
      return;
    }
    const dateFile = new Date(day.dayStart).toISOString().slice(0, 10);
    const file = new File([blob], `kosu-takip-${dateFile}.png`, { type: 'image/png' });
    const dateLabel = new Date(day.dayStart).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
    const shareText = `${dateLabel}: ${day.totalKm.toFixed(2)} km, ${Fmt.duration(day.totalMinutes * 60000)}, ${day.totalCalories} kcal`;

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Günlük Özet', text: shareText });
      } catch (err) {
        // kullanıcı paylaşma penceresini iptal etti; sessizce geç
      }
    } else if (navigator.share) {
      try {
        await navigator.share({ title: 'Günlük Özet', text: shareText });
      } catch (err) {}
    } else {
      await downloadDayCard(day);
      AppToast('Bu tarayıcıda paylaşım desteklenmiyor, görsel indirildi.');
    }
  }

  function renderDaySummaries(activities) {
    const wrap = document.getElementById('daySummaryList');
    if (!wrap) return;

    const days = computeDaySummaries(activities).slice(0, 30);
    if (days.length === 0) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = days
      .map((d, idx) => {
        const dateLabel = new Date(d.dayStart).toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          weekday: 'long',
        });
        return `
        <div class="card">
          <div class="card-row">
            <div>
              <h3>${dateLabel}</h3>
              <div class="meta">${d.count} antrenman</div>
            </div>
          </div>
          <div class="summary-grid cols-4" style="margin-top:10px; margin-bottom:0;">
            <div class="stat-cell">
              <div class="stat-value">${d.totalKm.toFixed(2)}</div>
              <div class="stat-label">km</div>
            </div>
            <div class="stat-cell">
              <div class="stat-value">${Math.round(d.totalMinutes)}</div>
              <div class="stat-label">dk</div>
            </div>
            <div class="stat-cell">
              <div class="stat-value">${d.avgSpeedKmh > 0 ? d.avgSpeedKmh.toFixed(1) : '-.-'}</div>
              <div class="stat-label">km/sa</div>
            </div>
            <div class="stat-cell">
              <div class="stat-value">${d.avgAltitudeM !== null ? Math.round(d.avgAltitudeM) : '—'}</div>
              <div class="stat-label">irtifa (m)</div>
            </div>
          </div>
          <div class="chip-row" style="justify-content:flex-start;margin-top:10px">
            <div class="chip">${Icons.markup('flame')}${d.totalCalories} kcal</div>
          </div>
          <div class="controls" style="padding:10px 0 0;">
            <button class="btn btn-secondary" data-download-day="${idx}" type="button">${Icons.markup('download')}İndir</button>
            <button class="btn btn-accent" data-share-day="${idx}" type="button">${Icons.markup('share')}Paylaş</button>
          </div>
        </div>`;
      })
      .join('');

    wrap.querySelectorAll('[data-download-day]').forEach((btn) => {
      btn.addEventListener('click', () => downloadDayCard(days[Number(btn.getAttribute('data-download-day'))]));
    });
    wrap.querySelectorAll('[data-share-day]').forEach((btn) => {
      btn.addEventListener('click', () => shareDayCard(days[Number(btn.getAttribute('data-share-day'))]));
    });
  }

  function renderAll() {
    const activities = Storage.getActivities();
    renderStats(activities);
    renderList(activities);
    renderDaySummaries(activities);
  }

  document.addEventListener('tab:show', (e) => {
    if (e.detail.tab === 'history') renderAll();
  });

  document.addEventListener('activity:saved', renderAll);
})();
