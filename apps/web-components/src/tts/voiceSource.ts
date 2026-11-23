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
export type VoiceSource = 'auto' | 'device' | 'server' | 'custom';

export interface VoiceConfig {
  source: VoiceSource;
  apiUrl?: string;
  customUrl?: string;
}

const SOURCES: VoiceSource[] = ['auto', 'device', 'server', 'custom'];
let config: VoiceConfig = { source: 'auto' };
/** APIs that answered "no voice provider" (501): not asked again on this page. */
const unavailable = new Set<string>();

export function parseVoiceSource(value: string | null | undefined): VoiceSource {
  return SOURCES.includes(value as VoiceSource) ? (value as VoiceSource) : 'auto';
}

export function setVoiceConfig(next: VoiceConfig): void {
  config = { ...next, source: next.customUrl && next.source === 'auto' ? 'custom' : next.source };
}

export function getVoiceConfig(): VoiceConfig {
  return config;
}

/** Whether a device voice should be tried before any remote voice. */
export function deviceVoiceFirst(cfg: VoiceConfig = config): boolean {
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
  cfg: VoiceConfig = config,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const request = remoteRequest(text.slice(0, 1000), lang, cfg);
  if (!request || unavailable.has(request.url)) return null;
  try {
    const response = await fetcher(request.url, { ...request.init, signal: AbortSignal.timeout(15_000) });
    if (response.status === 501) unavailable.add(request.url);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('audio/')) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    return null; // offline, blocked or slow: fall back quietly
  }
}
