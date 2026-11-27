import { mmsIds, splitSentences, type MmsVoiceConfig } from './mmsText';

/**
 * Read aloud voices that run in the browser: Meta's open MMS voices as ONNX files (made by
 * .github/workflows/voices.yml, copied to Hugging Face by voices-hf.yml), played with ONNX Runtime Web.
 * Nothing is downloaded until the person presses "Download voice"; the files then stay in the browser cache,
 * so the voice also works offline. The text never leaves the device. Voices are CC BY NC 4.0 (non commercial).
 */
export const VOICE_BASE = 'https://huggingface.co/aspesia/digital-bridge-voices/resolve/main';
const ORT_VERSION = '1.20.1';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const CACHE = 'db-voices-v1';
/** Languages with a browser voice, and the download size in MB shown on the button. */
export const BROWSER_VOICES: Record<string, number> = { om: 115, am: 115, ti: 115, so: 115 };

/** The small part of ONNX Runtime Web used here (loaded from the CDN only when a voice is used). */
interface Session {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>>;
  release(): Promise<void>;
}
interface Ort {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: 'int64', data: BigInt64Array, dims: number[]) => unknown;
  InferenceSession: { create(model: Uint8Array): Promise<Session> };
}

let ortPromise: Promise<Ort> | null = null;
let current: { lang: string; cfg: MmsVoiceConfig; session: Session } | null = null;
let queue: Promise<unknown> = Promise.resolve();
const installed = new Set<string>();

const urls = (lang: string) => ({ model: `${VOICE_BASE}/mms-${lang}.onnx`, config: `${VOICE_BASE}/mms-${lang}.json` });

export function browserVoiceSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof caches !== 'undefined' && typeof window !== 'undefined';
}

export function hasBrowserVoice(lang: string): boolean {
  return lang in BROWSER_VOICES && browserVoiceSupported();
}

/** Whether the voice files are already saved in this browser. */
export async function browserVoiceInstalled(lang: string): Promise<boolean> {
  if (!hasBrowserVoice(lang)) return false;
  if (installed.has(lang)) return true;
  try {
    const cache = await caches.open(CACHE);
    const { model, config } = urls(lang);
    const ok = Boolean((await cache.match(model)) && (await cache.match(config)));
    if (ok) installed.add(lang);
    return ok;
  } catch {
    return false;
  }
}

/** Downloads the voice into the browser cache, reporting progress from 0 to 100. */
export async function installBrowserVoice(lang: string, onProgress?: (percent: number) => void): Promise<void> {
  const cache = await caches.open(CACHE);
  const { model, config } = urls(lang);
  const cfg = await fetch(config);
  if (!cfg.ok) throw new Error(`voice config ${cfg.status}`);
  const response = await fetch(model);
  if (!response.ok || !response.body) throw new Error(`voice ${response.status}`);
  const total = Number(response.headers.get('content-length')) || BROWSER_VOICES[lang] * 1e6;
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    received += value.length;
    onProgress?.(Math.min(99, Math.floor((received / total) * 100)));
  }
  await cache.put(model, new Response(new Blob(chunks), { headers: { 'Content-Type': 'application/octet-stream' } }));
  await cache.put(config, cfg);
  installed.add(lang);
  onProgress?.(100);
}

function loadOrt(): Promise<Ort> {
  ortPromise ??= import(/* @vite-ignore */ `${ORT_BASE}ort.wasm.min.mjs`).then((ort: Ort) => {
    ort.env.wasm.wasmPaths = ORT_BASE;
    // Several threads need a cross origin isolated page; most host pages are not.
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    return ort;
  });
  return ortPromise;
}

async function open(lang: string): Promise<{ cfg: MmsVoiceConfig; session: Session; ort: Ort }> {
  const ort = await loadOrt();
  if (current?.lang === lang) return { ...current, ort };
  const cache = await caches.open(CACHE);
  const { model, config } = urls(lang);
  const [modelResponse, configResponse] = await Promise.all([cache.match(model), cache.match(config)]);
  if (!modelResponse || !configResponse) throw new Error('voice not downloaded');
  await current?.session.release();
  current = null; // free the old voice before loading the next (each takes a few hundred MB)
  const session = await ort.InferenceSession.create(new Uint8Array(await modelResponse.arrayBuffer()));
  current = { lang, cfg: (await configResponse.json()) as MmsVoiceConfig, session };
  return { ...current, ort };
}

/** 16 bit mono WAV, which every browser plays. */
export function encodeWav(samples: Float32Array, rate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true));
  return new Blob([view], { type: 'audio/wav' });
}

// ---- Background worker ---------------------------------------------------------------------------------------
// The voice runs in a Web Worker, so the page keeps answering taps while a sentence is made (it takes a few seconds
// on phones). A site whose security rules block workers falls back to the page itself (open() above).
const WORKER_CODE = `
let ort = null;
let session = null;
self.onmessage = async (event) => {
  const { id, cmd } = event.data;
  try {
    if (cmd === 'load') {
      ort = ort || (await import('${ORT_BASE}ort.wasm.min.mjs'));
      ort.env.wasm.wasmPaths = '${ORT_BASE}';
      ort.env.wasm.numThreads = 1;
      if (session) await session.release();
      session = null;
      session = await ort.InferenceSession.create(new Uint8Array(event.data.model));
      self.postMessage({ id, ok: true });
    } else {
      const ids = event.data.ids;
      const input = new ort.Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]);
      const wave = (await session.run({ input_ids: input })).waveform.data;
      self.postMessage({ id, ok: true, wave }, [wave.buffer]);
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error) });
  }
};
`;

type Reply = { ok: boolean; wave?: Float32Array; error?: string };
let worker: Worker | null | undefined; // undefined: not tried yet; null: not available here
let workerLang: string | null = null;
let seq = 0;
const pending = new Map<number, (reply: Reply) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const url = URL.createObjectURL(new Blob([WORKER_CODE], { type: 'text/javascript' }));
    worker = new Worker(url, { type: 'module' });
    worker.onmessage = (event: MessageEvent<Reply & { id: number }>) => {
      pending.get(event.data.id)?.(event.data);
      pending.delete(event.data.id);
    };
    worker.onerror = () => {
      pending.forEach((reply) => reply({ ok: false, error: 'worker failed' }));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function ask(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<Reply> {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    getWorker()!.postMessage({ ...message, id }, transfer);
  });
}

async function voiceConfig(lang: string): Promise<MmsVoiceConfig> {
  const response = await (await caches.open(CACHE)).match(urls(lang).config);
  if (!response) throw new Error('voice not downloaded');
  return (await response.json()) as MmsVoiceConfig;
}

/** One sentence's sound from the worker, or null when the worker cannot be used (then the page does it). */
async function runInWorker(lang: string, ids: number[]): Promise<Float32Array | null> {
  if (!getWorker()) return null;
  if (workerLang !== lang) {
    const model = await (await caches.open(CACHE)).match(urls(lang).model);
    if (!model) return null;
    const bytes = await model.arrayBuffer();
    const loaded = await ask({ cmd: 'load', model: bytes }, [bytes]);
    if (!loaded.ok) {
      worker?.terminate();
      worker = null;
      return null;
    }
    workerLang = lang;
  }
  const reply = await ask({ cmd: 'run', ids });
  return reply.ok && reply.wave ? reply.wave : null;
}

async function synthesise(text: string, lang: string): Promise<string | null> {
  const cfg = await voiceConfig(lang);
  const pause = new Float32Array(Math.round(cfg.sampling_rate * 0.25));
  const pieces: Float32Array[] = [];
  for (const part of splitSentences(text)) {
    const ids = mmsIds(part, cfg, lang);
    if (ids.length <= 1) continue;
    let wave = await runInWorker(lang, ids);
    if (!wave) {
      // No worker here: run on the page (slower to respond, but it still speaks).
      const { session, ort } = await open(lang);
      const input = new ort.Tensor('int64', BigInt64Array.from(ids, (id) => BigInt(id)), [1, ids.length]);
      wave = (await session.run({ input_ids: input })).waveform.data as Float32Array;
    }
    pieces.push(wave, pause);
  }
  if (!pieces.length) return null;
  const all = new Float32Array(pieces.reduce((n, p) => n + p.length, 0));
  pieces.reduce((at, p) => (all.set(p, at), at + p.length), 0);
  return URL.createObjectURL(encodeWav(all, cfg.sampling_rate));
}

/** Spoken audio as an object URL from a downloaded browser voice, or null (not downloaded, or it failed). */
export async function browserSpeech(text: string, lang: string): Promise<string | null> {
  if (!(await browserVoiceInstalled(lang))) return null;
  // One sentence at a time: the next phrase is prepared while the current one plays, never two at once.
  const run = queue.then(() => synthesise(text, lang)).catch(() => null);
  queue = run;
  return run;
}
