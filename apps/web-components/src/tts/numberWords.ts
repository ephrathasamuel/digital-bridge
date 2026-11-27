/**
 * Numbers as words for the MMS voices, which skip digits ("Item 3" was read as "Item"). Same rules as
 * apps/voice-space/numbers_words.py (mmsText.test.ts checks both give the same ids). Whole numbers 0 to 999 are said as
 * words; longer ones digit by digit. The wording needs a speaker check.
 */
interface NumberWords {
  units: string[];
  ten: string;
  teen: string;
  tens: string[];
  tensUnit: string;
  hundred: string;
  hundreds: string;
  join: string;
}

const WORDS: Record<string, NumberWords> = {
  am: {
    units: ['ዜሮ', 'አንድ', 'ሁለት', 'ሦስት', 'አራት', 'አምስት', 'ስድስት', 'ሰባት', 'ስምንት', 'ዘጠኝ'],
    ten: 'አሥር', teen: 'አሥራ {u}',
    tens: ['', '', 'ሃያ', 'ሠላሳ', 'አርባ', 'ሃምሳ', 'ስልሳ', 'ሰባ', 'ሰማንያ', 'ዘጠና'], tensUnit: '{t} {u}',
    hundred: 'መቶ', hundreds: '{u} መቶ', join: '{h} {r}',
  },
  om: {
    units: ['zeeroo', 'tokko', 'lama', 'sadii', 'afur', 'shan', 'jaha', 'torba', 'saddeet', 'sagal'],
    ten: 'kudhan', teen: 'kudha {u}',
    tens: ['', '', 'digdama', 'soddoma', 'afurtama', 'shantama', 'jaatama', 'torbaatama', 'saddeettama', 'sagaltama'],
    tensUnit: '{t_stem}ii {u}',
    hundred: 'dhibba', hundreds: 'dhibba {u}', join: '{h} fi {r}',
  },
  ti: {
    units: ['ዜሮ', 'ሓደ', 'ክልተ', 'ሰለስተ', 'ኣርባዕተ', 'ሓሙሽተ', 'ሽዱሽተ', 'ሸውዓተ', 'ሸሞንተ', 'ትሽዓተ'],
    ten: 'ዓሰርተ', teen: 'ዓሰርተ {u}',
    tens: ['', '', 'ዕስራ', 'ሰላሳ', 'ኣርብዓ', 'ሓምሳ', 'ሱሳ', 'ሰብዓ', 'ሰማንያ', 'ቴስዓ'], tensUnit: '{t}ን {u}ን',
    hundred: 'ሚእቲ', hundreds: '{u} ሚእቲ', join: '{h} {r}',
  },
  so: {
    units: ['eber', 'kow', 'laba', 'saddex', 'afar', 'shan', 'lix', 'toddoba', 'siddeed', 'sagaal'],
    ten: 'toban', teen: '{u} iyo toban',
    tens: ['', '', 'labaatan', 'soddon', 'afartan', 'konton', 'lixdan', 'toddobaatan', 'siddeetan', 'sagaashan'],
    tensUnit: '{t} iyo {u}',
    hundred: 'boqol', hundreds: '{u} boqol', join: '{h} iyo {r}',
  },
};

const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? '');

export function sayNumber(n: number, lang: string): string {
  const w = WORDS[lang];
  if (n < 10) return w.units[n];
  if (n === 10) return w.ten;
  if (n < 20) return fill(w.teen, { u: w.units[n - 10] });
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    const tens = w.tens[t];
    if (!u) return tens;
    return fill(w.tensUnit, { t: tens, t_stem: tens.endsWith('a') ? tens.slice(0, -1) : tens, u: w.units[u] });
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h === 1 ? w.hundred : fill(w.hundreds, { u: w.units[h] });
  return rest ? fill(w.join, { h: head, r: sayNumber(rest, lang) }) : head;
}

export function spellNumbers(text: string, lang: string): string {
  const w = WORDS[lang];
  if (!w) return text;
  return text.replace(/\d+/g, (digits) =>
    digits.length <= 3 ? ` ${sayNumber(Number(digits), lang)} ` : ` ${Array.from(digits, (d) => w.units[Number(d)]).join(' ')} `,
  );
}
