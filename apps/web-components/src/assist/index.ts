/**
 * Digital Bridge help bar for ANY page: one script tag on your own site, or the browser extension on sites you use
 * (LinkedIn, job boards, government forms). It reads form fields aloud, lets people answer by voice and type Amharic
 * with English letters, and makes the page easier to see. It never submits a form or sends answers anywhere.
 *
 *   <script src="https://…/db-assist.js" data-lang="am" data-api="https://…/api/v1" defer></script>
 *
 * Options (script data attributes, or window.DigitalBridgeAssist = {...} set before the script):
 *   lang       en | am                       first language of the bar and the voice (remembered per site)
 *   api        Digital Bridge API base        enables open source voices for languages the device lacks
 *   voice      auto | device | server | custom
 *   voiceUrl   your own text to speech URL    {text} and {lang} are filled in (see tts/voiceSource.ts)
 *   position   right | left
 */
import { I18N, type I18nKey, type Lang } from '@db/shared-schemas';
import { toFidel } from '../i18n/fidel';
import { normaliseSpoken } from '../voice/spokenInput';
import { getSpeechRecognition, type SpeechRecognitionLike } from '../voice/speech';
import { deviceVoiceFirst, fetchRemoteSpeech, parseVoiceSource, setVoiceConfig } from '../tts/voiceSource';
import {
  canTakeText, composeFieldText, fieldHint, fieldLabel, fieldValue, insertText, isFormField, isRequired, spokenKindFor,
  type FormField,
} from './fields';

interface AssistOptions { lang?: string; api?: string; voice?: string; voiceUrl?: string; position?: string }
interface Settings { lang: Lang; open: boolean; bigText: boolean; focus: boolean; links: boolean; contrast: boolean }

const HOST_ID = 'db-assist-host';
const STORE_KEY = 'db-assist-settings';
const DISPLAY: Array<[keyof Settings, I18nKey]> = [
  ['bigText', 'assist.bigText'], ['focus', 'assist.focus'], ['links', 'assist.links'], ['contrast', 'assist.contrast'],
];

function readOptions(): AssistOptions {
  const fromWindow = (window as unknown as { DigitalBridgeAssist?: AssistOptions }).DigitalBridgeAssist ?? {};
  const script = document.currentScript as HTMLScriptElement | null;
  return { ...(script?.dataset ?? {}), ...fromWindow } as AssistOptions;
}

function loadSettings(options: AssistOptions): Settings {
  const base: Settings = { lang: options.lang === 'am' ? 'am' : 'en', open: false, bigText: false, focus: false, links: false, contrast: false };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return base;
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings last until the page closes.
  }
}

/** Page wide display changes. The help bar itself is left out so it never moves or blurs. */
function pageCss(s: Settings): string {
  return [
    s.bigText ? 'html { font-size: 125% !important; -webkit-text-size-adjust: 125%; }' : '',
    s.focus
      ? '*:focus-visible, *:focus { outline: 4px solid #ffd43b !important; outline-offset: 2px !important; box-shadow: 0 0 0 7px #0b0f19 !important; }'
      : '',
    s.links ? 'a, a * { text-decoration: underline !important; text-underline-offset: 3px; }' : '',
    s.contrast ? `body > *:not(#${HOST_ID}) { filter: contrast(1.35) saturate(1.15); }` : '',
  ].join('\n');
}

const BAR_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.bar { position: fixed; bottom: 1rem; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: .5rem;
  font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Ethiopic', 'Nyala', sans-serif; color: #0b0f19; }
.bar.right { right: 1rem; } .bar.left { left: 1rem; align-items: flex-start; }
button, select, input { font: inherit; }
button { min-height: 44px; min-width: 44px; padding: 0 .9rem; border: 2px solid #0b3c8c; border-radius: .6rem; background: #fff;
  color: #0b3c8c; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: .4rem; }
button:hover { background: #e4ecf8; }
button.primary, .toggle { background: #0b3c8c; color: #fff; }
button.primary:hover, .toggle:hover { background: #082d6b; }
button[aria-pressed='true'] { border-width: 3px; background: #ffd43b; color: #0b0f19; border-color: #0b0f19; }
button[aria-pressed='true']::before { content: '✓'; }
.toggle { border-color: #0b0f19; box-shadow: 0 2px 10px rgba(11,15,25,.35); }
:focus-visible { outline: 3px solid #ffd43b; outline-offset: 2px; box-shadow: 0 0 0 6px #0b0f19; }
.panel { width: min(23rem, calc(100vw - 2rem)); max-height: min(80vh, 40rem); overflow: auto; padding: 1rem; background: #fff;
  border: 2px solid #0b0f19; border-radius: .9rem; box-shadow: 0 6px 24px rgba(11,15,25,.3); }
.panel[hidden] { display: none; }
h2 { margin: 0 0 .25rem; font-size: 1.15rem; } h3 { margin: .9rem 0 .4rem; font-size: 1rem; }
p { margin: 0 0 .6rem; } .hint { color: #2f3a4d; font-size: .9rem; }
.row { display: flex; flex-wrap: wrap; gap: .5rem; }
label { display: block; font-weight: 700; margin-bottom: .25rem; }
select, input { width: 100%; min-height: 44px; padding: 0 .6rem; border: 2px solid #5f6b7d; border-radius: .5rem; background: #fff; color: #0b0f19; }
.fidel-out { min-height: 2rem; margin: .4rem 0; font-size: 1.3rem; font-family: 'Noto Sans Ethiopic', 'Nyala', sans-serif; }
.status { min-height: 1.5rem; margin-top: .75rem; padding: .5rem; border-left: 4px solid #0b3c8c; background: #f4f6fa; font-weight: 600; }
.status:empty { display: none; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountAssist(options: AssistOptions = readOptions()): void {
  if (document.getElementById(HOST_ID)) return; // the script and the extension on one page: keep one bar
  const settings = loadSettings(options);
  setVoiceConfig({ source: parseVoiceSource(options.voice), apiUrl: options.api, customUrl: options.voiceUrl });

  const host = el('div', { id: HOST_ID });
  const shadow = host.attachShadow({ mode: 'open' });
  const pageStyle = el('style', { id: 'db-assist-page-style' });
  document.head.append(pageStyle);
  document.body.append(host);

  let lastField: FormField | null = null;
  let recognition: SpeechRecognitionLike | null = null;
  let audio: HTMLAudioElement | null = null;
  const t = (key: I18nKey, vars: Record<string, string> = {}) =>
    Object.entries(vars).reduce((text, [k, v]) => text.replace(`{${k}}`, v), I18N[settings.lang][key] ?? I18N.en[key]);

  // Remember the last form field used on the page, so a click on the bar still knows which field is meant.
  document.addEventListener('focusin', (event) => {
    const path = event.composedPath();
    const target = path[0] as Element | null;
    // composedPath crosses shadow roots; host.contains() does not, so it would count the bar's own inputs.
    if (target && !path.includes(host) && isFormField(target)) lastField = target;
  }, true);

  const style = el('style', {}, BAR_CSS);
  const bar = el('div', { class: `bar ${options.position === 'left' ? 'left' : 'right'}` });
  const panel = el('section', { class: 'panel', id: 'db-assist-panel', 'aria-labelledby': 'db-assist-title' });
  const toggle = el('button', { type: 'button', class: 'toggle', 'aria-controls': 'db-assist-panel' });
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  shadow.append(style, bar);
  bar.append(panel, toggle);

  const announce = (text: string) => { status.textContent = text; };
  const voiceLang = () => (settings.lang === 'am' ? 'am-ET' : 'en-US');

  const speak = async (text: string) => {
    window.speechSynthesis?.cancel();
    audio?.pause();
    const prefix = settings.lang;
    const device = window.speechSynthesis?.getVoices().find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (deviceVoiceFirst() && device) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = device;
      utterance.lang = device.lang;
      window.speechSynthesis.speak(utterance);
      announce(text);
      return;
    }
    const remote = await fetchRemoteSpeech(text, settings.lang);
    if (remote) {
      audio = new Audio(remote);
      audio.onended = () => URL.revokeObjectURL(remote);
      void audio.play().catch(() => undefined);
      announce(text);
      return;
    }
    if (device) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = device;
      window.speechSynthesis.speak(utterance);
      announce(text);
      return;
    }
    announce(`${t('assist.noVoice')} ${text}`); // no sound: the words are still shown (and read by screen readers)
  };

  const field = (): FormField | null => {
    if (lastField?.isConnected) return lastField;
    announce(t('assist.noField'));
    return null;
  };

  const readField = () => {
    const target = field();
    if (!target) return;
    void speak(composeFieldText(
      { label: fieldLabel(target), hint: fieldHint(target), value: fieldValue(target), required: isRequired(target) },
      { template: t('assist.fieldText'), required: t('assist.required'), empty: t('assist.empty'), unnamed: t('assist.unnamed') },
    ));
  };

  const dictateButton = el('button', { type: 'button', 'aria-pressed': 'false' });
  const stopDictation = () => recognition?.stop();
  const dictate = () => {
    if (recognition) return stopDictation();
    const target = field();
    if (!target) return;
    if (!canTakeText(target)) return announce(t('assist.noField'));
    const Ctor = getSpeechRecognition();
    if (!Ctor) return announce(t('assist.noVoiceInput'));
    const engine = new Ctor();
    engine.lang = voiceLang();
    engine.interimResults = false;
    engine.maxAlternatives = 1;
    let heard = '';
    engine.onresult = (event) => {
      heard = Array.from({ length: event.results.length }, (_, i) => event.results[i][0]?.transcript ?? '').join(' ').trim();
    };
    engine.onerror = () => announce(t('assist.noVoiceInput'));
    engine.onend = () => {
      recognition = null;
      dictateButton.setAttribute('aria-pressed', 'false');
      dictateButton.textContent = t('assist.dictate');
      if (!heard) return;
      const text = normaliseSpoken(heard, spokenKindFor(target));
      insertText(target, text); // never submitted: the person checks the field and goes on themselves
      announce(t('assist.heard', { text }));
      target.focus();
    };
    recognition = engine;
    engine.start();
    dictateButton.setAttribute('aria-pressed', 'true');
    dictateButton.textContent = t('assist.dictateStop');
    announce(t('assist.listening'));
  };

  const render = () => {
    toggle.textContent = t('assist.open');
    toggle.setAttribute('aria-expanded', String(settings.open));
    panel.hidden = !settings.open;
    panel.lang = settings.lang;
    pageStyle.textContent = pageCss(settings);
    panel.replaceChildren();

    const title = el('h2', { id: 'db-assist-title' }, t('assist.title'));
    const intro = el('p', { class: 'hint' }, t('assist.intro'));

    const langLabel = el('label', { for: 'db-assist-lang' }, t('assist.language'));
    const langSelect = el('select', { id: 'db-assist-lang' });
    for (const [value, name] of [['en', 'English'], ['am', 'አማርኛ']] as const) {
      const option = el('option', { value, lang: value }, name);
      option.selected = settings.lang === value;
      langSelect.append(option);
    }
    langSelect.addEventListener('change', () => {
      settings.lang = langSelect.value === 'am' ? 'am' : 'en';
      update();
      shadow.getElementById('db-assist-lang')?.focus();
    });

    const readButton = el('button', { type: 'button', class: 'primary' }, t('assist.read'));
    readButton.addEventListener('click', readField);
    dictateButton.textContent = recognition ? t('assist.dictateStop') : t('assist.dictate');
    dictateButton.onclick = dictate;
    const actions = el('div', { class: 'row', style: 'margin-top:.75rem' });
    actions.append(readButton, dictateButton);

    const fidelLabel = el('label', { for: 'db-assist-fidel', style: 'margin-top:1rem' }, t('assist.fidel'));
    const fidelHint = el('p', { class: 'hint', id: 'db-assist-fidel-hint' }, t('assist.fidelHint'));
    const fidelInput = el('input', { id: 'db-assist-fidel', type: 'text', autocomplete: 'off', 'aria-describedby': 'db-assist-fidel-hint' });
    const fidelOut = el('p', { class: 'fidel-out', lang: 'am', 'aria-live': 'polite' });
    fidelInput.addEventListener('input', () => { fidelOut.textContent = toFidel(fidelInput.value); });
    const fidelInsert = el('button', { type: 'button' }, t('assist.fidelInsert'));
    fidelInsert.addEventListener('click', () => {
      const target = field();
      if (!target || !fidelOut.textContent) return;
      if (!canTakeText(target)) return announce(t('assist.noField'));
      insertText(target, fidelOut.textContent);
      fidelInput.value = '';
      fidelOut.textContent = '';
      announce(t('assist.inserted'));
      target.focus();
    });

    const displayTitle = el('h3', {}, t('assist.display'));
    const display = el('div', { class: 'row' });
    for (const [key, label] of DISPLAY) {
      const button = el('button', { type: 'button', 'aria-pressed': String(settings[key]) }, t(label));
      button.addEventListener('click', () => {
        (settings[key] as boolean) = !settings[key];
        update();
        (shadow.querySelectorAll('.display-toggle')[DISPLAY.findIndex(([k]) => k === key)] as HTMLElement | undefined)?.focus();
      });
      button.classList.add('display-toggle');
      display.append(button);
    }

    panel.append(title, intro, langLabel, langSelect, actions, fidelLabel, fidelHint, fidelInput, fidelOut,
      fidelInsert, displayTitle, display, status);
  };

  const update = () => {
    saveSettings(settings);
    render();
  };

  toggle.addEventListener('click', () => {
    settings.open = !settings.open;
    update();
    if (settings.open) (shadow.getElementById('db-assist-lang') as HTMLElement | null)?.focus();
  });
  shadow.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Escape' && settings.open) {
      settings.open = false;
      update();
      toggle.focus();
    }
  });
  // Alt+Shift+H opens or closes the bar from anywhere on the page.
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'KeyH') {
      event.preventDefault();
      toggle.click();
    }
  });
  render();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const options = readOptions(); // document.currentScript is only set while this script first runs
  const start = () => mountAssist(options);
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
