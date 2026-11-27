/**
 * Where read aloud audio comes from. Set by the widget attributes voice="auto|device|server|custom" and
 * voice-url="…" (see ReactShadowElement). No keys live in the browser: "server" goes through our API
 * (POST {api}/voice/speak), which holds any provider key; "custom" calls a URL the site owner chose.
 *
 * auto    device voice for the language if there is one, else our API, else recorded clips and captions (default)
 * device  only voices installed on the device, then recorded clips and captions
 * server  our API first (open source MMS voices or the configured provider), then device voices
 * custom  voice-url first: with {text} and {lang} in it, a GET; otherwise a POST of {"text","lang"}
 */
import { browserSpeech } from './browserVoice';
import { clipSpeech } from './clipVoice';

export type VoiceSource = 'auto' | 'device' | 'server' | 'custom';

export interface VoiceConfig {
  source: VoiceSource;
  apiUrl?: string;
  customUrl?: string;
}

const SOURCES: VoiceSource[] = ['auto', 'device', 'server', 'custom'];
let config: VoiceConfig = { source: 'auto' };
/**
 * APIs that answered "no voice provider" (501): not asked again on this page, nor for a day on this device
 * (a free API server may be asleep, and waking it only to hear "no voice" took about a minute on a phone).
 */
const unavailable = new Set<string>();
const NO_VOICE_KEY = 'db-voice-none:';
const DAY_MS = 24 * 60 * 60 * 1000;

function isUnavailable(url: string): boolean {
  if (unavailable.has(url)) return true;
  try {
    const at = Number(localStorage.getItem(NO_VOICE_KEY + url));
    return at > 0 && Date.now() - at < DAY_MS;
  } catch {
    return false;
  }
}

function markUnavailable(url: string): void {
  unavailable.add(url);
  try {
    localStorage.setItem(NO_VOICE_KEY + url, String(Date.now()));
  } catch {
    // storage blocked: remembered for this page only
  }
}

export function parseVoiceSource(value: string | null | undefined): VoiceSource {
  return SOURCES.includes(value as VoiceSource) ? (value as VoiceSource) : 'auto';
}

export function setVoiceConfig(next: VoiceConfig): void {
  config = { ...next, source: next.customUrl && next.source === 'auto' ? 'custom' : next.source };
}

export function getVoiceConfig(): VoiceConfig {
  return config;
}

/**
 * The person's own choice in the Voice menu, remembered on this device. "auto" keeps what the site set up (the
 * default); "device" uses the voices installed on the device; "ours" uses the Digital Bridge clips and downloaded
 * voice first, so a PC and a phone sound the same.
 */
export type VoiceChoice = 'auto' | 'device' | 'ours';
export const VOICE_CHOICES: VoiceChoice[] = ['auto', 'device', 'ours'];
const CHOICE_KEY = 'db-voice-choice';
const choiceListeners = new Set<(choice: VoiceChoice) => void>();

export function getVoiceChoice(): VoiceChoice {
  try {
    const saved = localStorage.getItem(CHOICE_KEY) as VoiceChoice | null;
    return saved && VOICE_CHOICES.includes(saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

export function setVoiceChoice(choice: VoiceChoice): void {
  try {
    localStorage.setItem(CHOICE_KEY, choice);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  sessionChoice = choice;
  choiceListeners.forEach((listener) => listener(choice));
}

export function onVoiceChoice(listener: (choice: VoiceChoice) => void): () => void {
  choiceListeners.add(listener);
  return () => choiceListeners.delete(listener);
}

let sessionChoice: VoiceChoice | null = null;

/** The site's voice setup with the person's choice applied. */
export function effectiveVoiceConfig(): VoiceConfig {
  const choice = sessionChoice ?? getVoiceChoice();
  if (choice === 'device') return { ...config, source: 'device' };
  if (choice === 'ours') return { ...config, source: 'server', customUrl: undefined };
  return config;
}

/** Whether a device voice should be tried before any remote voice. */
export function deviceVoiceFirst(cfg: VoiceConfig = effectiveVoiceConfig()): boolean {
  return cfg.source === 'auto' || cfg.source === 'device';
}

function remoteRequest(text: string, lang: string, cfg: VoiceConfig): { url: string; init: RequestInit } | null {
  if (cfg.source === 'device') return null;
  if (cfg.customUrl) {
    if (cfg.customUrl.includes('{text}')) {
      const url = cfg.customUrl.replace('{text}', encodeURIComponent(text)).replace('{lang}', encodeURIComponent(lang));
      return { url, init: { method: 'GET' } };
    }
    return {
      url: cfg.customUrl,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) },
    };
  }
  if (!cfg.apiUrl) return null;
  return {
    url: `${cfg.apiUrl.replace(/\/+$/, '')}/voice/speak`,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) },
  };
}

/** Spoken audio for the text as an object URL, or null (then the caller uses device voices, clips or captions). */
export async function fetchRemoteSpeech(
  text: string,
  lang: string,
  cfg: VoiceConfig = effectiveVoiceConfig(),
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  // Ready made clips of the pack text come first (instant, a few KB), then a voice the person downloaded into this
  // browser (offline, the text stays on the device), then the voice server.
  // "device" never calls out, so it skips the clips (they come from the network) but uses a downloaded voice.
  if (cfg.source !== 'custom') {
    const local = (cfg.source === 'device' ? null : await clipSpeech(text, lang)) ?? (await browserSpeech(text, lang));
    if (local) return local;
  }
  const request = remoteRequest(text.slice(0, 1000), lang, cfg);
  if (!request || isUnavailable(request.url)) return null;
  try {
    // "auto" has other voices to fall back on, so it waits less for a slow or sleeping server.
    const wait = cfg.source === 'auto' ? 6_000 : 15_000;
    const response = await fetcher(request.url, { ...request.init, signal: AbortSignal.timeout(wait) });
    if (response.status === 501) markUnavailable(request.url);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('audio/')) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    return null; // offline, blocked or slow: fall back quietly
  }
}
