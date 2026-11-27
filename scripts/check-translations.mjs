// Translation check with Gemini: back translates every string of a language pack into English and compares the
// meaning with our English text, so word for word or wrong translations are flagged for a native speaker.
// Only the fixed interface text of the packs is sent (never anything a person typed or any personal data).
// The AI only points at lines; a speaker decides and fixes them (PUT /i18n/{lang}/{key}).
//
//   GEMINI_API_KEY=... node scripts/check-translations.mjs om,ti,so [model]
//
// Writes translation-check/<lang>.csv and a summary (GitHub step summary when run in Actions).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error('GEMINI_API_KEY is not set');
const langs = (process.argv[2] ?? 'om,ti,so').split(',');
const model = process.argv[3] || 'gemini-3.8-flash';
const NAMES = { om: 'Afaan Oromoo', ti: 'Tigrinya', so: 'Somali', am: 'Amharic' };
const BATCH = 20;
const PAUSE_MS = 7000; // free tier: stay under about 10 requests a minute

const english = JSON.parse(readFileSync('apps/web-components/src/i18n/en.json', 'utf8'));

function pack(lang) {
  if (lang === 'am') return JSON.parse(readFileSync('apps/web-components/src/i18n/am.json', 'utf8'));
  const text = readFileSync(`apps/api/src/translate/packs/${lang}.ts`, 'utf8');
  const out = {};
  for (const m of text.matchAll(/^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/gm)) out[m[1]] = JSON.parse(`"${m[2]}"`);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(lang, items) {
  const prompt = [
    `You check the ${NAMES[lang]} translation of a website that helps people sign up for courses and jobs in Ethiopia.`,
    'For each item: translate the target text back into English yourself (do not look at the English first), then',
    'compare it with the English source. Rate "meaning" 1 to 5 (5 = same meaning) and "natural" 1 to 5 (5 = how a native',
    'speaker would say it on a website, not word for word). Placeholders like {name} must stay unchanged.',
    'In "note" give a short reason in English when a score is below 4, and in "suggestion" a better target text if you',
    'are confident (else empty). Answer only with JSON: [{"key","back","meaning","natural","note","suggestion"}].',
    '',
    JSON.stringify(items.map(([key, source, target]) => ({ key, english: source, target }))),
  ].join('\n');
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
    if (response.status === 429 || response.status >= 500) {
      // Free tier limit or busy: show Google's reason, wait as long as it asks (RetryInfo), then try again.
      const body = await response.text();
      const asked = Number(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1] ?? 0);
      const wait = Math.max(asked * 1000 + 2000, 20000 * (attempt + 1));
      const reason = (/"message":\s*"([^"]*)"/.exec(body)?.[1] ?? body).slice(0, 300);
      console.log(`::warning::Gemini ${response.status} (try ${attempt + 1}), waiting ${Math.round(wait / 1000)} s: ${reason}`);
      await sleep(wait);
      continue;
    }
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]');
  }
  throw new Error('Gemini kept refusing (rate limit); try again later');
}

const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
mkdirSync('translation-check', { recursive: true });
const summary = ['# Translation check', '', `Model: ${model}. Flagged = meaning below 4 or natural below 3.`, ''];

for (const lang of langs) {
  const target = pack(lang);
  const items = Object.entries(target)
    .filter(([key, text]) => english[key] && text && !key.startsWith('loc.'))
    .map(([key, text]) => [key, english[key], text]);
  const rows = [];
  let stopped = '';
  for (let i = 0; i < items.length; i += BATCH) {
    try {
      rows.push(...(await ask(lang, items.slice(i, i + BATCH))));
    } catch (error) {
      // Keep what was checked so far (the report says where it stopped) instead of losing it all.
      stopped = `stopped at ${i} of ${items.length}: ${error.message}`;
      console.log(`::error::${lang}: ${stopped}`);
      break;
    }
    console.log(`${lang}: ${Math.min(i + BATCH, items.length)}/${items.length}`);
    await sleep(PAUSE_MS);
  }
  const flagged = rows.filter((r) => Number(r.meaning) < 4 || Number(r.natural) < 3);
  const lines = ['key,english,target,back,meaning,natural,note,suggestion'];
  for (const r of rows.sort((a, b) => a.meaning + a.natural - (b.meaning + b.natural))) {
    lines.push([r.key, english[r.key], target[r.key], r.back, r.meaning, r.natural, r.note, r.suggestion].map(csv).join(','));
  }
  writeFileSync(`translation-check/${lang}.csv`, `${lines.join('\n')}\n`);
  summary.push(`## ${NAMES[lang]}: ${flagged.length} of ${rows.length} flagged${stopped ? ` (${stopped})` : ''}`, '', '| key | meaning | natural | note |', '|---|---|---|---|');
  for (const r of flagged.slice(0, 40)) summary.push(`| ${r.key} | ${r.meaning} | ${r.natural} | ${String(r.note ?? '').replace(/\|/g, '/')} |`);
  summary.push('');
  console.log(`::notice::${lang}: ${flagged.length} of ${rows.length} strings flagged`);
}

writeFileSync('translation-check/summary.md', summary.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'));
