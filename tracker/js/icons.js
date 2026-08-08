// Basit satır-içi SVG ikon seti (emoji yerine). Feather-icons tarzı, tek renk (currentColor).
const Icons = (() => {
  const OUTLINE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const set = {
    home: `<svg viewBox="0 0 24 24" ${OUTLINE}><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V9.5"/></svg>`,
    map: `<svg viewBox="0 0 24 24" ${OUTLINE}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
    chart: `<svg viewBox="0 0 24 24" ${OUTLINE}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" ${OUTLINE}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 21 12 6 21 6 3"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    stop: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`,
    close: `<svg viewBox="0 0 24 24" ${OUTLINE}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check: `<svg viewBox="0 0 24 24" ${OUTLINE}><polyline points="20 6 9 17 4 12"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" ${OUTLINE}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    undo: `<svg viewBox="0 0 24 24" ${OUTLINE}><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" ${OUTLINE}><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
    walk: `<svg viewBox="0 0 24 24" ${OUTLINE}><circle cx="12" cy="6" r="3"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" ${OUTLINE}><path d="M12 22s7-7.58 7-12.5A7 7 0 105 9.5C5 14.42 12 22 12 22z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
    flame: `<svg viewBox="0 0 24 24" ${OUTLINE}><path d="M12 2c1 3-3 4-3 8a3 3 0 006 0c0-1-1-2-1-2s2 2 2 5a5 5 0 01-10 0c0-5 4-7 4-11z"/></svg>`,
    footprint: `<svg viewBox="0 0 24 24" ${OUTLINE}><ellipse cx="12" cy="7" rx="3" ry="4.5"/><ellipse cx="12" cy="17.5" rx="4" ry="4"/></svg>`,
    repeat: `<svg viewBox="0 0 24 24" ${OUTLINE}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>`,
    download: `<svg viewBox="0 0 24 24" ${OUTLINE}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    share: `<svg viewBox="0 0 24 24" ${OUTLINE}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  };

  // Sayfada [data-icon="ad"] olan tüm elemanların içine ilgili SVG'yi enjekte eder.
  function hydrate(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.getAttribute('data-icon');
      if (set[name] && !el.dataset.iconDone) {
        el.innerHTML = set[name];
        el.classList.add('icon');
        el.dataset.iconDone = '1';
      }
    });
  }

  // routes.js/history.js gibi template string'ler içinde doğrudan kullanmak için.
  function markup(name) {
    return `<span class="icon icon-inline" data-icon="${name}">${set[name] || ''}</span>`;
  }

  return { hydrate, markup, set };
})();
