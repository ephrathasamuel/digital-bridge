import { BROWSER_VOICES, VOICE_BASE } from './browserVoice';
import { mmsIds, type MmsVoiceConfig } from './mmsText';
import { getVoiceChoice } from './voiceSource';

/**
 * Ready made read aloud clips for the fixed text of the language packs (made by .github/workflows/voice-clips.yml
 * with the same MMS voices). Text is cut into pieces at punctuation; each piece's clip is named after its token
 * ids, so "Item 3: Name, text box." plays the clips for "Item 3", "Name" and "text box" joined into one sound.
 * A phrase with any piece missing gets no clip (then the browser voice, the voice server or captions take over).
 * Same rules as pieces() and clip_key() in apps/voice-space/mms_text.py.
 */
const PIECE_SPLIT = /[,:;.!?،፡-፨\n]+/u;

export function pieces(text: string): string[] {
  return text.split(PIECE_SPLIT).map((p) => p.trim()).filter(Boolean);
}

/** FNV-1a 32 bit of the ids joined by commas, as 8 hex digits. */
export function clipKey(ids: number[]): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(ids.join(','))) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

interface ClipIndex {
  cfg: MmsVoiceConfig;
  keys: Set<string>;
}
const indexes = new Map<string, Promise<ClipIndex | null>>();

function loadIndex(lang: string): Promise<ClipIndex | null> {
  let index = indexes.get(lang);
  if (!index) {
    index = Promise.all([fetch(`${VOICE_BASE}/mms-${lang}.json`), fetch(`${VOICE_BASE}/clips/${lang}/index.json`)])
      .then(async ([cfg, keys]) =>
        cfg.ok && keys.ok ? { cfg: (await cfg.json()) as MmsVoiceConfig, keys: new Set((await keys.json()) as string[]) } : null,
      )
      .catch(() => null);
    indexes.set(lang, index);
  }
  return index;
}

/** The phrase as one sound from ready made clips (an object URL), or null when a piece has no clip. */
export async function clipSpeech(text: string, lang: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!(lang in BROWSER_VOICES) || typeof fetch === 'undefined') return null;
  // The natural Amharic voice has its own clips (made as "am-natural"); until they exist, the usual ones play.
  const natural = lang === 'am' && getVoiceChoice() === 'natural' ? await loadIndex('am-natural') : null;
  const voice = natural ? 'am-natural' : lang;
  const index = natural ?? (await loadIndex(lang));
  if (!index) return null;
  const keys = pieces(text)
    .map((piece) => mmsIds(piece, index.cfg))
    .filter((ids) => ids.length > 1)
    .map(clipKey);
  if (!keys.length || keys.some((key) => !index.keys.has(key))) return null;
  try {
    const parts = await Promise.all(
      keys.map(async (key) => {
        const response = await fetcher(`${VOICE_BASE}/clips/${voice}/${key}.mp3`);
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      }),
    );
    // Constant bit rate MP3 without headers: joining the files byte by byte gives one playable sound.
    return URL.createObjectURL(new Blob(parts, { type: 'audio/mpeg' }));
  } catch {
    return null;
  }
}
