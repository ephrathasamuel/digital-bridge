import { describe, expect, it } from 'vitest';
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
