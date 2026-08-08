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
        <div class="summary-grid" style="margin-top:10px; margin-bottom:0;">
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

  function renderAll() {
    const activities = Storage.getActivities();
    renderStats(activities);
    renderList(activities);
  }

  document.addEventListener('tab:show', (e) => {
    if (e.detail.tab === 'history') renderAll();
  });

  document.addEventListener('activity:saved', renderAll);
})();
