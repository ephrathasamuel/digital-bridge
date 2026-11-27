import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clipKey, pieces } from './clipVoice';
import { mmsIds, type MmsVoiceConfig } from './mmsText';
import fixtures from './clipVoice.fixtures.json';

const configs = JSON.parse(readFileSync(join(__dirname, 'mmsText.configs.json'), 'utf8')) as Record<string, MmsVoiceConfig>;

describe('read aloud clip names (same as pieces() and clip_key() in apps/voice-space/mms_text.py)', () => {
  for (const [lang, { text, pieces: want, keys }] of Object.entries(fixtures)) {
    it(`cuts and names ${lang} like Python`, () => {
      expect(pieces(text)).toEqual(want);
      expect(pieces(text).map((p) => clipKey(mmsIds(p, configs[lang])))).toEqual(keys);
    });
  }
});
