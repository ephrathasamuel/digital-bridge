/**
 * One tap "add a language": the English interface text is machine translated (by default Meta's NLLB 200, whose
 * weights are CC BY NC 4.0, so a commercial deploy should point the API at another provider), cached, marked as
 * machine translated, and fixable by speakers.
 * Pure helpers only, shared by the API and the widgets.
 */

/** Languages offered for one tap translation: BCP 47 code -> NLLB 200 code and the name in the language itself. */
export const EXTRA_LANGS = {
  om: { nllb: 'gaz_Latn', name: 'Afaan Oromoo' },
  ti: { nllb: 'tir_Ethi', name: 'ትግርኛ' },
  so: { nllb: 'som_Latn', name: 'Soomaali' },
  sw: { nllb: 'swh_Latn', name: 'Kiswahili' },
  aa: { nllb: 'aar_Latn', name: 'Qafaraf' },
} as const satisfies Record<string, { nllb: string; name: string }>;

export type ExtraLang = keyof typeof EXTRA_LANGS;

export function isExtraLang(lang: string): lang is ExtraLang {
  return Object.prototype.hasOwnProperty.call(EXTRA_LANGS, lang);
}

/** NLLB code for a language, or null when we do not offer it. Amharic and English are written by people. */
export function nllbCode(lang: string): string | null {
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return isExtraLang(base) ? EXTRA_LANGS[base].nllb : null;
}

/** Where a string came from: a machine, or a person who speaks the language. */
export type TranslationSource = 'machine' | 'person';

export interface LanguagePack {
  lang: string;
  /** key -> translated text. Keys missing here fall back to English. */
  strings: Record<string, string>;
  /** Keys whose text a speaker has checked; every other key is machine translated. */
  checked: string[];
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Machine translation can mangle {placeholders}. Swap them for numbered tokens the model leaves alone,
 * and keep the names so restorePlaceholders can put them back.
 */
export function protectPlaceholders(text: string): { text: string; names: string[] } {
  const names: string[] = [];
  const out = text.replace(PLACEHOLDER, (_m, name: string) => {
    names.push(name);
    return `[${names.length - 1}]`;
  });
  return { text: out, names };
}

/** Put {placeholders} back. Returns null when the machine dropped or added one, so the caller keeps English. */
export function restorePlaceholders(translated: string, names: string[]): string | null {
  const found = translated.match(/\[\d+\]/g) ?? [];
  if (found.length !== names.length) return null;
  let ok = true;
  const out = translated.replace(/\[(\d+)\]/g, (_m, i: string) => {
    const name = names[Number(i)];
    if (name === undefined) ok = false;
    return `{${name}}`;
  });
  return ok ? out : null;
}
