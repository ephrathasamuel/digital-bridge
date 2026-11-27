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
   * Phones show a native <select> as the system's own grey dialog. This swaps it for a button and a list of choices
   * in the page (disclosure pattern: aria-expanded, aria-pressed choices, Escape closes). The select stays in the
   * page, hidden, and keeps the value, so the rest of the code and no script setups still work.
   */
  function enhanceSelect(select) {
    const label = document.querySelector(`label[for="${select.id}"]`);
    const wrap = document.createElement('div');
    wrap.className = 'db-pick';
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    const list = document.createElement('ul');
    list.id = `${select.id}-choices`;
    list.hidden = true;
    list.setAttribute('aria-label', label ? label.textContent : '');
    button.setAttribute('aria-controls', list.id);
    const close = (focus) => {
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (focus) button.focus();
    };
    const refresh = () => {
      const current = select.options[select.selectedIndex];
      button.textContent = `${label ? label.textContent : ''}: ${current ? current.textContent : ''}`;
      list.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.value === select.value)));
    };
    Array.from(select.options).forEach((option) => {
      const item = document.createElement('li');
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.value = option.value;
      choice.textContent = option.textContent;
      choice.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change'));
        refresh();
        close(true);
      });
      item.append(choice);
      list.append(item);
    });
    button.addEventListener('click', () => {
      const open = list.hidden;
      list.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      if (open) (list.querySelector('[aria-pressed="true"]') || list.querySelector('button')).focus();
    });
    list.addEventListener('keydown', (event) => {
      const buttons = Array.from(list.querySelectorAll('button'));
      const at = buttons.indexOf(document.activeElement);
      const move = (to) => {
        event.preventDefault();
        buttons[(to + buttons.length) % buttons.length].focus();
      };
      if (event.key === 'Escape') close(true);
      else if (event.key === 'ArrowDown') move(at + 1);
      else if (event.key === 'ArrowUp') move(at - 1);
    });
    select.hidden = true;
    if (label) label.hidden = true;
    wrap.append(button, list);
    select.after(wrap);
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
