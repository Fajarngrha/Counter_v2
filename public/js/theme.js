(function () {
  const STORAGE_KEY = 'iot_ui_theme';

  function getTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'dark';
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function syncButtons(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const isLight = theme === 'light';
      btn.setAttribute('aria-pressed', String(isLight));
      btn.title = isLight ? 'Ganti ke mode gelap' : 'Ganti ke mode terang';
      const label = btn.querySelector('.theme-label');
      if (label) label.textContent = isLight ? 'Terang' : 'Gelap';
    });
  }

  function apply(theme, notify) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    syncButtons(next);
    if (notify !== false) {
      window.dispatchEvent(new CustomEvent('iot-theme-change', { detail: { theme: next } }));
    }
  }

  function toggle() {
    apply(getTheme() === 'dark' ? 'light' : 'dark');
  }

  apply(getTheme(), false);

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-theme-toggle]');
    if (!btn) return;
    toggle();
  });

  window.IotTheme = { getTheme, apply, toggle, cssVar };
})();
