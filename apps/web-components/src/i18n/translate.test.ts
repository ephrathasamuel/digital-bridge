import { describe, expect, it, vi } from 'vitest';
import { isExtraLang, nllbCode, protectPlaceholders, restorePlaceholders } from '@db/shared-schemas';

describe('one tap add a language helpers', () => {
  it('maps offered languages to NLLB codes and refuses the rest', () => {
    expect(nllbCode('om')).toBe('gaz_Latn');
    expect(nllbCode('ti-ET')).toBe('tir_Ethi');
    expect(nllbCode('am')).toBeNull();
    expect(isExtraLang('so')).toBe(true);
    expect(isExtraLang('toString')).toBe(false);
  });

  it('keeps {placeholders} safe through translation', () => {
    const { text, names } = protectPlaceholders('Step {step} of {total}');
    expect(text).toBe('Step [0] of [1]');
    expect(restorePlaceholders('Tarkaanfii [0] keessaa [1]', names)).toBe('Tarkaanfii {step} keessaa {total}');
    expect(restorePlaceholders('[1] keessaa [0]', names)).toBe('{total} keessaa {step}');
  });

  it('gives up when the machine drops or invents a placeholder', () => {
    const { names } = protectPlaceholders('Hello {name}');
    expect(restorePlaceholders('Akkam', names)).toBeNull();
    expect(restorePlaceholders('Akkam [0] [1]', names)).toBeNull();
    expect(restorePlaceholders('Akkam [3]', names)).toBeNull();
  });
});

describe('added language overlay', async () => {
  const { t } = await import('./index');
  const { setExtraPack, loadExtraPack, activeExtraLang } = await import('./extraPack');

  it('shows the pack text over English and falls back for missing keys', () => {
    setExtraPack({ lang: 'om', strings: { 'ask.answerHeading': 'Deebii' }, checked: [] });
    expect(t('en', 'ask.answerHeading')).toBe('Deebii');
    expect(t('en', 'ask.youAsked')).not.toBe('');
    expect(t('am', 'ask.answerHeading')).not.toBe('Deebii');
    setExtraPack(null);
    expect(t('en', 'ask.answerHeading')).not.toBe('Deebii');
  });

  it('loads a pack from the API and refuses an empty one', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify({ lang: url.endsWith('/so') ? 'so' : 'ti', strings: url.endsWith('/so') ? {} : { a: 'b' }, checked: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadExtraPack('ti', 'https://api.test/v1')).toBe(true);
    expect(activeExtraLang()).toBe('ti');
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/v1/i18n/ti');
    setExtraPack(null);
    expect(await loadExtraPack('so', 'https://api.test/v1')).toBe(false);
    vi.unstubAllGlobals();
  });
});
