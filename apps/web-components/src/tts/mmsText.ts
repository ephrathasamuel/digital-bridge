import { ETHIOPIC_ROMAN } from './ethiopicRoman';

/**
 * Text to MMS voice token ids in the browser: the same rules as apps/voice-space/mms_text.py (checked against
 * transformers when the voices are made). mmsText.fixtures.json holds ids from the Python version for real pack text.
 */
export interface MmsVoiceConfig {
  sampling_rate: number;
  is_uroman: boolean;
  normalize: boolean;
  add_blank: boolean;
  vocab: Record<string, number>;
}

const SPLIT = /(?<=[.!?።፧])\s+|\n+/u;

/** Short pieces sound more natural and keep memory low; empty pieces are dropped. */
export function splitSentences(text: string): string[] {
  return text.split(SPLIT).map((p) => p.trim()).filter(Boolean);
}

/** Ge'ez letters to Latin like uroman; other letters lose their accents (uroman does the same for Latin). */
export function romanise(text: string): string {
  let out = '';
  for (const ch of text) out += ETHIOPIC_ROMAN[ch] ?? ch.normalize('NFD').replace(/\p{M}/gu, '');
  return out;
}

export function mmsIds(text: string, cfg: MmsVoiceConfig): number[] {
  const vocab = cfg.vocab;
  const has = (s: string) => Object.prototype.hasOwnProperty.call(vocab, s);
  const words = Object.keys(vocab).filter((w) => Array.from(w).length > 1).sort((a, b) => b.length - a.length);
  let s = cfg.is_uroman ? romanise(text) : text;
  if (cfg.normalize) {
    // Keep anything the vocabulary has as is (also multi letter entries), lower case the rest.
    let out = '';
    let i = 0;
    while (i < s.length) {
      const word = words.find((w) => s.startsWith(w, i)) ?? (has(String.fromCodePoint(s.codePointAt(i)!)) ? String.fromCodePoint(s.codePointAt(i)!) : null);
      if (word) {
        out += word;
        i += word.length;
      } else {
        const ch = String.fromCodePoint(s.codePointAt(i)!);
        out += ch.toLowerCase();
        i += ch.length;
      }
    }
    s = out;
  }
  const kept = Array.from(s).filter(has).join('').trim();
  const ids = Array.from(kept).map((c) => vocab[c]);
  if (!cfg.add_blank) return ids;
  const withBlanks = new Array<number>(ids.length * 2 + 1).fill(0);
  ids.forEach((id, i) => (withBlanks[i * 2 + 1] = id));
  return withBlanks;
}
