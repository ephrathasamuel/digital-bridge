// Bridge Learning demo host: top bar language buttons and Colours menu for every Digital Bridge widget on the page.
(() => {
  'use strict';

  /**
   * Top-bar language switch (signup, profile, jobs): sets lang on every Digital Bridge widget on the page.
   * ?lang=am in the URL, or the learner's last choice on this device, is applied on load.
   */
  // Added languages: their buttons appear only when the API has text saved for them.
  const EXTRA_LANGS = { om: 'Afaan Oromoo', ti: 'ትግርኛ', so: 'Soomaali', sw: 'Kiswahili', aa: 'Qafaraf' };
  const KNOWN_LANGS = ['en', 'am', ...Object.keys(EXTRA_LANGS)];
  const HOSTED_API = 'https://digital-bridge-api.onrender.com/api/v1';

  function setupWidgetLanguage() {
    const group = document.querySelector('.db-topbar-lang');
    if (!group || !group.querySelector('[data-db-lang]')) return;
    const buttons = () => group.querySelectorAll('[data-db-lang]');
    const widgets = () =>
      document.querySelectorAll('db-signup, db-onboarding-wizard, db-career-gateway, db-employer-accommodations, db-ask');
    let current = 'en';
    const apply = (lang) => {
      current = lang;
      widgets().forEach((widget) => widget.setAttribute('lang', lang));
      buttons().forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.dbLang === lang)));
      try {
        localStorage.setItem('db-host-lang', lang);
      } catch (error) {
        // Storage blocked: the choice still applies to this page.
      }
    };
    group.addEventListener('click', (event) => {
      const button = event.target.closest('[data-db-lang]');
      if (button) apply(button.dataset.dbLang);
    });
    let initial = new URLSearchParams(location.search).get('lang');
    if (!KNOWN_LANGS.includes(initial)) {
      try {
        initial = localStorage.getItem('db-host-lang');
      } catch (error) {
        initial = null;
      }
    }
    if (KNOWN_LANGS.includes(initial)) apply(initial);

    const widget = widgets()[0];
    const explicit = widget && (widget.getAttribute('api') || widget.getAttribute('api-url'));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const api = explicit ? explicit.replace(/\/+$/, '') : local ? null : HOSTED_API;
    if (!api) return;
    fetch(`${api}/i18n`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        (json && json.languages ? json.languages : [])
          .filter((item) => EXTRA_LANGS[item.lang] && item.translated > 0)
          .forEach((item) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.dbLang = item.lang;
            button.setAttribute('aria-pressed', String(current === item.lang));
            const name = document.createElement('span');
            name.lang = item.lang;
            name.textContent = EXTRA_LANGS[item.lang];
            button.append(name);
            group.append(button);
          });
      })
      .catch(() => {
        // API asleep or away: English and Amharic still work.
      });
  }

  /**
   * Top-bar "Colours" menu: Warm / Colour-blind safe / High contrast / Dark. Sets vision="…" on every widget and a
   * class on <body>; remembered on this device (same key the widgets use, so both menus stay in step).
   */
  /**
   * Phones show a native <select> as the system's own grey dialog, and a long chosen name pushed the page past the
   * screen. This shows the choices as a row of buttons that scrolls sideways (like the Home / Sign up tabs), each
   * the same size with up to two lines. The select stays in the page, hidden, and keeps the value.
   */
  function enhanceSelect(select) {
    const label = document.querySelector(`label[for="${select.id}"]`);
    const row = document.createElement('div');
    row.className = 'db-pick-row';
    row.setAttribute('role', 'group');
    if (label) {
      label.id = label.id || `${select.id}-label`;
      row.setAttribute('aria-labelledby', label.id);
    }
    const refresh = () => {
      row.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.value === select.value)));
    };
    Array.from(select.options).forEach((option) => {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.value = option.value;
      choice.textContent = option.textContent;
      choice.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change'));
        refresh();
      });
      row.append(choice);
    });
    select.hidden = true;
    select.after(row);
    refresh();
    return refresh;
  }

  function setupVisionSelect() {
    const select = document.querySelector('[data-db-vision]');
    if (!select) return;
    let refreshPick = () => {};
    const modes = ['terracotta', 'colorblind-safe', 'high-contrast', 'dark'];
    const widgets = () =>
      document.querySelectorAll('db-signup, db-onboarding-wizard, db-career-gateway, db-employer-accommodations, db-ask');
    const apply = (mode, fromWidget) => {
      if (!modes.includes(mode)) return;
      select.value = mode;
      refreshPick();
      document.body.classList.toggle('db-high-contrast', mode === 'high-contrast');
      document.body.classList.toggle('db-dark', mode === 'dark');
      document.body.classList.toggle('db-colorblind-safe', mode === 'colorblind-safe');
      if (!fromWidget) widgets().forEach((widget) => widget.setAttribute('vision', mode));
      try {
        localStorage.setItem('db-vision-mode', mode);
      } catch (error) {
        // Storage blocked: the choice still applies to this page.
      }
    };
    select.addEventListener('change', () => apply(select.value, false));
    refreshPick = enhanceSelect(select);
    window.addEventListener('db-vision-mode', (event) => apply(event.detail && event.detail.mode, true));
    let initial = new URLSearchParams(location.search).get('vision');
    if (new URLSearchParams(location.search).get('contrast') === 'high') initial = 'high-contrast';
    if (!modes.includes(initial)) {
      try {
        initial = localStorage.getItem('db-vision-mode');
      } catch (error) {
        initial = null;
      }
    }
    if (modes.includes(initial)) apply(initial, false);
  }

  function setupAll() {
    setupWidgetLanguage();
    setupVisionSelect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAll, { once: true });
  } else {
    setupAll();
  }
})();
