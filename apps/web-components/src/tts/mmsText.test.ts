import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav } from './browserVoice';
import { mmsIds, romanise, splitSentences, type MmsVoiceConfig } from './mmsText';
import fixtures from './mmsText.fixtures.json';

// Small copies of the voices' vocabularies (the real .json files are on Hugging Face), taken from the fixtures run.
const configs = JSON.parse(readFileSync(join(__dirname, 'mmsText.configs.json'), 'utf8')) as Record<string, MmsVoiceConfig>;

describe('MMS text to ids (same as apps/voice-space/mms_text.py)', () => {
  for (const [lang, cases] of Object.entries(fixtures as Record<string, { text: string; ids: number[] }[]>)) {
    it(`matches the Python ids for ${lang}`, () => {
      for (const { text, ids } of cases) expect(mmsIds(text, configs[lang])).toEqual(ids);
    });
  }

  it('romanises Ge\'ez letter by letter', () => {
    expect(romanise('ሰላም')).toBe('salaame'); // what uroman 1.3.1.1 gives
  });

  it('splits sentences on Latin and Ethiopic full stops', () => {
    expect(splitSentences('Akkam. Nagaan?  ሰላም። እንዴት ነህ')).toEqual(['Akkam.', 'Nagaan?', 'ሰላም።', 'እንዴት ነህ']);
  });

  it('writes a 16 bit mono WAV', async () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16000);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    expect(bytes.length).toBe(44 + 6);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(new DataView(bytes.buffer).getInt16(46, true)).toBe(32767);
  });
});
