/**
 * Digital Bridge help bar for ANY page: one script tag on your own site, or the browser extension on sites you use
 * (LinkedIn, job boards, government forms). It reads form fields aloud, lets people answer by voice and type Amharic
 * with English letters, and makes the page easier to see. It never submits a form or sends answers anywhere.
 *
 *   <script src="https://…/db-assist.js" data-lang="am" data-api="https://…/api/v1" defer></script>
 *
 * Options (script data attributes, or window.DigitalBridgeAssist = {...} set before the script):
 *   lang       en | am | om | ti | so | ...  first language of the bar and the voice (remembered per site)
 *   api        Digital Bridge API base        loads added languages (om, ti, so, ...) and open source voices for
 *                                            languages the device lacks
 *   voice      auto | device | server | custom
 *   voiceUrl   your own text to speech URL    {text} and {lang} are filled in (see tts/voiceSource.ts)
 *   position   right | left
 */
import { EXTRA_LANGS, I18N, isExtraLang, type ExtraLang, type I18nKey, type Lang } from '@db/shared-schemas';
import { toFidel } from '../i18n/fidel';
import { activeExtraLang, listReadyLangs, loadExtraPack, machineNote, overlayText, setExtraPack, setPackApiUrl } from '../i18n/extraPack';
import { normaliseSpoken } from '../voice/spokenInput';
import { getSpeechRecognition, type SpeechRecognitionLike } from '../voice/speech';
import { deviceVoiceFirst, fetchRemoteSpeech, parseVoiceSource, setVoiceConfig } from '../tts/voiceSource';
import { joinTranscripts } from '../ask/askVoice';
import {
  canTakeText, composeFieldText, describeElement, fieldHint, fieldLabel, fieldValue, insertText, isFormField, isRequired, keepsArrow,
  neighbourCell, spokenKindFor, tableCellOf, type FormField,
} from './fields';

/** Listening ends this long after the last word; the words then wait in the review box. */
const PAUSE_MS = 2_000;
/** Items the arrow keys step through in "Read as I move": controls, plus table cells so tables can be read. */
const STOPS = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), td, th';

interface AssistOptions { lang?: string; api?: string; voice?: string; voiceUrl?: string; position?: string }
/** English, Amharic, or an added language whose text comes from the API pack over English. */
type BarLang = Lang | ExtraLang;
interface Settings { lang: BarLang; open: boolean; bigText: boolean; focus: boolean; links: boolean; contrast: boolean; darkContrast: boolean; readMove: boolean }

const HOST_ID = 'db-assist-host';
const STORE_KEY = 'db-assist-settings';
const DISPLAY: Array<[keyof Settings, I18nKey]> = [
  ['bigText', 'assist.bigText'], ['focus', 'assist.focus'], ['links', 'assist.links'], ['contrast', 'assist.contrast'],
  ['darkContrast', 'assist.darkContrast'],
];

function readOptions(): AssistOptions {
  const fromWindow = (window as unknown as { DigitalBridgeAssist?: AssistOptions }).DigitalBridgeAssist ?? {};
  const script = document.currentScript as HTMLScriptElement | null;
  return { ...(script?.dataset ?? {}), ...fromWindow } as AssistOptions;
}

/** Speech recognition tags for voice answers. Browsers that cannot listen in a language say so, and people type. */
const RECOGNITION: Record<BarLang, string> = {
  en: 'en-US', am: 'am-ET', om: 'om-ET', ti: 'ti-ET', so: 'so-SO', sw: 'sw-KE', aa: 'aa-ET',
};

function toBarLang(value: unknown): BarLang {
  if (value === 'en' || value === 'am') return value;
  return typeof value === 'string' && isExtraLang(value) ? value : 'en';
}

function loadSettings(options: AssistOptions): Settings {
  const base: Settings = { lang: toBarLang(options.lang), open: false, bigText: false, focus: false, links: false, contrast: false, darkContrast: false, readMove: false };
  try {
    const saved = { ...base, ...(JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Settings>) };
    return { ...saved, lang: toBarLang(saved.lang) };
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

/**
 * A real high contrast mode for any site: every colour on the page is replaced (21:1 text, solid borders, underlined
 * links, no background pictures behind text). Images and videos are left as they are.
 */
function highContrast(bg: string, fg: string, link: string, accent: string): string {
  const all = `body *:not(#${HOST_ID}):not(img):not(video):not(picture):not(svg):not(svg *)`;
  return [
    `html, body { background: ${bg} !important; color: ${fg} !important; }`,
    `${all} { background-color: transparent !important; background-image: none !important; color: ${fg} !important;`,
    `  border-color: ${fg} !important; text-shadow: none !important; box-shadow: none !important; }`,
    `body a, body a * { color: ${link} !important; text-decoration: underline !important; }`,
    `body input, body textarea, body select, body button, body [role='button'] { background-color: ${bg} !important; color: ${fg} !important;`,
    `  border: 2px solid ${accent} !important; }`,
    `body ::placeholder { color: ${fg} !important; opacity: 0.8 !important; }`,
    `body svg { fill: currentColor; }`,
    // Pinned headers and bars stay solid, or the page would show through them while scrolling.
    `body *:not(#${HOST_ID})[data-db-assist-solid] { background-color: ${bg} !important; }`,
    `body *:focus, body *:focus-visible { outline: 4px solid ${accent} !important; outline-offset: 2px !important; }`,
  ].join('\n');
}

/** Page wide display changes. The help bar itself is left out so it never moves or blurs. */
function pageCss(s: Settings): string {
  return [
    s.bigText ? 'html { font-size: 125% !important; -webkit-text-size-adjust: 125%; }' : '',
    s.focus
      ? '*:focus-visible, *:focus { outline: 4px solid #ffd43b !important; outline-offset: 2px !important; box-shadow: 0 0 0 7px #0b0f19 !important; }'
      : '',
    s.links ? 'a, a * { text-decoration: underline !important; text-underline-offset: 3px; }' : '',
    // The field being filled: dashed outline plus a tint that matches the page mode (no white flash in dark mode).
    s.darkContrast
      ? '[data-db-assist-target] { outline: 4px dashed #ffff00 !important; outline-offset: 3px !important; background: #1f1f00 !important; color: #ffffff !important; }'
      : '[data-db-assist-target] { outline: 4px dashed #0b3c8c !important; outline-offset: 3px !important; background: #fff4cc !important; color: #0b0f19 !important; }',
    s.contrast ? highContrast('#ffffff', '#000000', '#0000cc', '#000000') : '',
    s.darkContrast ? highContrast('#000000', '#ffffff', '#ffff00', '#ffff00') : '',
    s.readMove ? '[data-db-assist-stop]:focus { outline: 4px solid #0b3c8c !important; outline-offset: -2px !important; background: #fff4cc !important; color: #0b0f19 !important; }' : '',
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
@media (max-width: 40rem) { .panel { max-height: 60vh; max-height: 60dvh; } }
.panel { overscroll-behavior: contain; scroll-padding: 1rem; }
/* The box being typed in is always clearly marked, also on touch screens (no keyboard focus ring there). */
input:focus, textarea:focus, select:focus { outline: 3px solid #ffd43b; outline-offset: 2px; box-shadow: 0 0 0 6px #0b0f19; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }
.where { margin: 0 0 .5rem; font-weight: 700; }
h2 { margin: 0 0 .25rem; font-size: 1.15rem; } h3 { margin: .9rem 0 .4rem; font-size: 1rem; }
p { margin: 0 0 .6rem; } .hint { color: #2f3a4d; font-size: .9rem; }
.row { display: flex; flex-wrap: wrap; gap: .5rem; }
label { display: block; font-weight: 700; margin-bottom: .25rem; }
select, input { width: 100%; min-height: 44px; padding: 0 .6rem; border: 2px solid #5f6b7d; border-radius: .5rem; background: #fff; color: #0b0f19; }
.fidel-out { min-height: 2rem; margin: .4rem 0; font-size: 1.3rem; font-family: 'Noto Sans Ethiopic', 'Nyala', sans-serif; }
.review { margin: .25rem 0 .75rem; padding: .75rem; border: 2px solid #0b3c8c; border-radius: .6rem; background: #f4f6fa; }
.review[hidden] { display: none; }
textarea { width: 100%; min-height: 4.5rem; padding: .5rem .6rem; border: 2px solid #5f6b7d; border-radius: .5rem; font: inherit; color: #0b0f19; background: #fff; }
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
  let readyLangs: ExtraLang[] = [];
  const lookup = (key: I18nKey): string => {
    const lang = settings.lang;
    if (!isExtraLang(lang)) return I18N[lang][key] ?? I18N.en[key];
    return (activeExtraLang() === lang ? overlayText(key) : undefined) ?? I18N.en[key];
  };
  const t = (key: I18nKey, vars: Record<string, string> = {}) =>
    Object.entries(vars).reduce((text, [k, v]) => text.replace(`{${k}}`, v), lookup(key));

  // Names the field that "Put into the field" will fill (the line is rebuilt with the panel).
  let fidelWhere: HTMLElement | null = null;
  const showWhere = () => {
    if (fidelWhere) fidelWhere.textContent = lastField?.isConnected ? t('assist.goesInto', { field: fieldLabel(lastField) }) : t('assist.noField');
  };

  // Remember the last form field used on the page, so a click on the bar still knows which field is meant.
  document.addEventListener('focusin', (event) => {
    const path = event.composedPath();
    const target = path[0] as Element | null;
    // composedPath crosses shadow roots; host.contains() does not, so it would count the bar's own inputs.
    if (target && !path.includes(host) && isFormField(target)) {
      lastField = target;
      showWhere();
    }
  }, true);

  /** Marks pinned (sticky or fixed) page elements, so the contrast modes keep them solid. */
  const markPinned = () => {
    for (const node of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (node === host) continue;
      const position = getComputedStyle(node).position;
      if (position === 'sticky' || position === 'fixed') node.setAttribute('data-db-assist-solid', '');
    }
  };

  const style = el('style', {}, BAR_CSS);
  const bar = el('div', { class: `bar ${options.position === 'left' ? 'left' : 'right'}` });
  const panel = el('section', { class: 'panel', id: 'db-assist-panel', 'aria-labelledby': 'db-assist-title' });
  const toggle = el('button', { type: 'button', class: 'toggle', 'aria-controls': 'db-assist-panel' });
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  shadow.append(style, bar);
  bar.append(panel, toggle);

  const announce = (text: string) => { status.textContent = text; };
  const voiceLang = () => RECOGNITION[settings.lang];

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
  // Review box: live words while speaking, editable, and nothing reaches the page field until "Use this".
  const review = el('div', { class: 'review', hidden: '' });
  const reviewWhere = el('p', { class: 'where' });
  const reviewLabel = el('label', { for: 'db-assist-live' });
  const reviewHint = el('p', { class: 'hint', id: 'db-assist-live-hint' });
  const reviewText = el('textarea', { id: 'db-assist-live', 'aria-describedby': 'db-assist-live-hint' });
  const useButton = el('button', { type: 'button', class: 'primary' });
  const retryButton = el('button', { type: 'button' });
  const reviewActions = el('div', { class: 'row', style: 'margin-top:.5rem' });
  reviewActions.append(useButton, retryButton);
  review.append(reviewWhere, reviewLabel, reviewHint, reviewText, reviewActions);
  let reviewTarget: FormField | null = null;
  let silence: ReturnType<typeof setTimeout> | undefined;

  const stopDictation = () => {
    clearTimeout(silence);
    const engine = recognition;
    if (!engine) return;
    // Phones can take a long time to finish a stopped recognition: the button answers at once, and if the engine
    // has not ended within a second it is cut off and finished here (the words heard so far go to the review box).
    dictateButton.setAttribute('aria-pressed', 'false');
    dictateButton.textContent = t('assist.dictate');
    engine.stop();
    setTimeout(() => {
      if (recognition !== engine) return;
      const finish = engine.onend;
      engine.onend = null;
      engine.abort();
      finish?.();
    }, 1000);
  };
  const closeReview = () => {
    review.hidden = true;
    reviewText.value = '';
    reviewTarget?.removeAttribute('data-db-assist-target');
  };
  const dictate = () => {
    if (recognition) return stopDictation();
    const target = field();
    if (!target) return;
    if (!canTakeText(target)) return announce(t('assist.noField'));
    const Ctor = getSpeechRecognition();
    if (!Ctor) return announce(t('assist.noVoiceInput'));
    const engine = new Ctor();
    engine.lang = voiceLang();
    engine.continuous = true; // keep listening through short pauses
    engine.interimResults = true; // words appear while the person speaks
    engine.maxAlternatives = 3;
    reviewTarget?.removeAttribute('data-db-assist-target');
    reviewTarget = target;
    // Show which field the words will go into, on the bar and on the page (phones: the field may be off screen).
    reviewWhere.textContent = t('assist.goesInto', { field: fieldLabel(target) });
    target.setAttribute('data-db-assist-target', '');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    review.hidden = false;
    reviewText.value = '';
    let heard = '';
    engine.onresult = (event) => {
      heard = joinTranscripts(event.results);
      reviewText.value = heard; // shown live; announced once at the end, not every guess
      clearTimeout(silence);
      silence = setTimeout(() => engine.stop(), PAUSE_MS);
    };
    engine.onerror = (event) => {
      // The browser's own reason is shown too (e.g. not-allowed, language-not-supported, network), so a phone that
      // cannot do speech input says why instead of doing nothing.
      if (event.error !== 'aborted' && event.error !== 'no-speech') announce(`${t('assist.noVoiceInput')} (${event.error})`);
    };
    engine.onend = () => {
      clearTimeout(silence);
      recognition = null;
      dictateButton.setAttribute('aria-pressed', 'false');
      dictateButton.textContent = t('assist.dictate');
      if (!heard) {
        closeReview();
        return;
      }
      reviewText.value = normaliseSpoken(heard, spokenKindFor(target));
      announce(`${t('assist.heard', { text: reviewText.value })} ${t('assist.checkWords')}`);
      reviewText.focus();
    };
    recognition = engine;
    try {
      engine.start();
    } catch (error) {
      recognition = null;
      closeReview();
      announce(`${t('assist.noVoiceInput')} (${(error as Error).name || 'start failed'})`);
      return;
    }
    dictateButton.setAttribute('aria-pressed', 'true');
    dictateButton.textContent = t('assist.dictateStop');
    announce(t('assist.listening'));
  };
  useButton.addEventListener('click', () => {
    const text = reviewText.value.trim();
    const target = reviewTarget;
    closeReview();
    if (!target?.isConnected || !text) return;
    insertText(target, text); // never submitted: the person checks the page and goes on themselves
    target.focus();
  });
  retryButton.addEventListener('click', () => {
    closeReview();
    dictate();
  });

  // ---------- Read as I move ----------
  const describeWords = () => ({
    field: { template: t('assist.fieldText'), required: t('assist.required'), empty: t('assist.empty'), unnamed: t('assist.unnamed') },
    button: t('assist.button'),
    link: t('assist.link'),
    cell: t('assist.cell'),
    headCell: t('assist.headCell'),
    emptyCell: t('assist.emptyCell'),
    checked: t('vc.checked'),
    unchecked: t('vc.unchecked'),
  });
  const visible = (node: Element) => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && !(node as HTMLInputElement).disabled;
  };
  const stops = () => Array.from(document.querySelectorAll<HTMLElement>(STOPS)).filter((n) => !host.contains(n) && visible(n));
  const moveTo = (next: HTMLElement) => {
    if (next.tabIndex < 0 || next instanceof HTMLTableCellElement) {
      next.setAttribute('tabindex', '-1'); // cells take focus without joining the Tab order
      next.setAttribute('data-db-assist-stop', '');
    }
    next.focus();
    next.scrollIntoView?.({ block: 'nearest' });
  };
  const ARROW_ROLES = ['slider', 'listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'grid', 'tree', 'combobox', 'spinbutton'];
  const inArrowWidget = (node: Element) => ARROW_ROLES.includes(node.closest('[role]')?.getAttribute('role') ?? '');


  document.addEventListener('focusin', (event) => {
    if (!settings.readMove) return;
    const path = event.composedPath();
    const target = path[0] as Element | null;
    if (!target || path.includes(host)) return;
    void speak(describeElement(target, describeWords()));
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!settings.readMove || !event.key.startsWith('Arrow') || event.altKey || event.ctrlKey || event.metaKey) return;
    const path = event.composedPath();
    if (path.includes(host)) return;
    const current = (path[0] as Element | null) ?? document.body;
    if (current !== document.body && (keepsArrow(current, event.key) || inArrowWidget(current))) return; // arrows keep their normal job
    const key = event.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
    const forward = key === 'ArrowDown' || key === 'ArrowRight';
    const cell = tableCellOf(current);
    let next: HTMLElement | null | undefined = cell ? neighbourCell(cell, key) : null;
    if (!next && !(cell && (key === 'ArrowLeft' || key === 'ArrowRight'))) {
      const list = stops();
      const table = cell?.closest('table');
      if (table) {
        // From the top or bottom edge of a table, step out of it.
        const inside = list.filter((n) => table.contains(n));
        const edge = forward ? list.indexOf(inside[inside.length - 1]) : list.indexOf(inside[0]);
        next = list[edge + (forward ? 1 : -1)];
      } else {
        const index = list.indexOf(current as HTMLElement);
        next = index < 0 ? (forward ? list[0] : list[list.length - 1]) : list[index + (forward ? 1 : -1)];
      }
    }
    if (!next) return;
    event.preventDefault();
    moveTo(next);
  }, true);

  const render = () => {
    toggle.textContent = t('assist.open');
    toggle.setAttribute('aria-expanded', String(settings.open));
    panel.hidden = !settings.open;
    panel.lang = settings.lang;
    if (settings.contrast || settings.darkContrast) markPinned();
    pageStyle.textContent = pageCss(settings);
    panel.replaceChildren();

    const title = el('h2', { id: 'db-assist-title' }, t('assist.title'));
    const minimise = el('button', { type: 'button' }, t('assist.minimise'));
    minimise.addEventListener('click', () => {
      settings.open = false;
      update();
      toggle.focus();
    });
    const head = el('div', { class: 'head' });
    head.append(title, minimise);
    const intro = el('p', { class: 'hint' }, t('assist.intro'));

    const langLabel = el('label', { for: 'db-assist-lang' }, t('assist.language'));
    const langSelect = el('select', { id: 'db-assist-lang' });
    const extras = [...new Set([...readyLangs, ...(isExtraLang(settings.lang) ? [settings.lang] : [])])];
    const choices: Array<[BarLang, string]> = [['en', 'English'], ['am', 'አማርኛ'], ...extras.map((l): [BarLang, string] => [l, EXTRA_LANGS[l].name])];
    for (const [value, name] of choices) {
      const option = el('option', { value, lang: value }, name);
      option.selected = settings.lang === value;
      langSelect.append(option);
    }
    langSelect.addEventListener('change', () => {
      void chooseLang(toBarLang(langSelect.value)).then(() => shadow.getElementById('db-assist-lang')?.focus());
    });
    // Added languages are machine translated: say so in English, so everyone can read why.
    const note = isExtraLang(settings.lang) ? [el('p', { class: 'hint', lang: 'en' }, machineNote(settings.lang))] : [];

    reviewLabel.textContent = t('assist.live');
    reviewHint.textContent = t('assist.checkWords');
    useButton.textContent = t('assist.useThis');
    retryButton.textContent = t('assist.tryAgain');

    const readMove = el('button', {
      type: 'button', id: 'db-assist-move', 'aria-pressed': String(settings.readMove), 'aria-describedby': 'db-assist-move-hint',
    }, t('assist.readMove'));
    readMove.addEventListener('click', () => {
      settings.readMove = !settings.readMove;
      update();
      (shadow.getElementById('db-assist-move') as HTMLElement | null)?.focus();
    });
    const readMoveHint = el('p', { class: 'hint', id: 'db-assist-move-hint' }, t('assist.readMoveHint'));

    const readButton = el('button', { type: 'button', class: 'primary' }, t('assist.read'));
    readButton.addEventListener('click', readField);
    dictateButton.textContent = recognition ? t('assist.dictateStop') : t('assist.dictate');
    dictateButton.onclick = dictate;
    const actions = el('div', { class: 'row', style: 'margin:.75rem 0' });
    actions.append(readButton, dictateButton);

    const fidelLabel = el('label', { for: 'db-assist-fidel', style: 'margin-top:1rem' }, t('assist.fidel'));
    const fidelHint = el('p', { class: 'hint', id: 'db-assist-fidel-hint' }, t('assist.fidelHint'));
    const fidelInput = el('input', { id: 'db-assist-fidel', type: 'text', autocomplete: 'off', 'aria-describedby': 'db-assist-fidel-hint' });
    const fidelOut = el('p', { class: 'fidel-out', lang: 'am', 'aria-live': 'polite' });
    fidelInput.addEventListener('input', () => { fidelOut.textContent = toFidel(fidelInput.value); });
    fidelWhere = el('p', { class: 'where' });
    showWhere();
    // While typing letters, the field they will go into is outlined on the page.
    fidelInput.addEventListener('focus', () => {
      lastField?.setAttribute('data-db-assist-target', '');
      // Phones: the keyboard covers the lower half, so keep the letters box and its buttons in view.
      setTimeout(() => fidelInput.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    });
    fidelInput.addEventListener('blur', () => lastField?.removeAttribute('data-db-assist-target'));
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
        // The two contrast modes replace each other.
        if (key === 'contrast' && settings.contrast) settings.darkContrast = false;
        if (key === 'darkContrast' && settings.darkContrast) settings.contrast = false;
        update();
        (shadow.querySelectorAll('.display-toggle')[DISPLAY.findIndex(([k]) => k === key)] as HTMLElement | undefined)?.focus();
      });
      button.classList.add('display-toggle');
      display.append(button);
    }

    panel.append(head, intro, ...note, langLabel, langSelect, actions, review, readMove, readMoveHint, fidelLabel, fidelHint,
      fidelInput, fidelOut, fidelWhere, fidelInsert, displayTitle, display, status);
  };

  const update = () => {
    saveSettings(settings);
    render();
  };

  /** Switch language; an added language loads its pack first and stays English when the API has none. */
  async function chooseLang(lang: BarLang): Promise<void> {
    if (isExtraLang(lang)) {
      const ok = await loadExtraPack(lang, options.api);
      if (!ok) {
        setExtraPack(null);
        settings.lang = 'en';
        update();
        announce(`${EXTRA_LANGS[lang].name}: not available right now.`);
        return;
      }
    } else {
      setExtraPack(null);
    }
    settings.lang = lang;
    update();
  }

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

  // Added languages: offer the ones the API has text for, and load the remembered one.
  setPackApiUrl(options.api);
  void listReadyLangs().then((langs) => {
    readyLangs = langs;
    if (langs.length && !shadow.activeElement) render(); // never rebuild the panel under someone's focus
  });
  if (isExtraLang(settings.lang)) void chooseLang(settings.lang);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const options = readOptions(); // document.currentScript is only set while this script first runs
  const start = () => mountAssist(options);
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
