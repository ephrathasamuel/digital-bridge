import { EXTRA_LANGS, isExtraLang, type ExtraLang, type LanguagePack } from '@db/shared-schemas';

/**
 * Added languages (lang="om", "ti", "so", ...): the widget keeps its English logic underneath and shows the saved
 * machine or speaker translation wherever the pack has the key. One language per page.
 */
let active: LanguagePack | null = null;
const loading = new Map<string, Promise<LanguagePack | null>>();

export function overlayText(key: string): string | undefined {
  return active?.strings[key];
}

export function activeExtraLang(): ExtraLang | null {
  return active && isExtraLang(active.lang) ? active.lang : null;
}

export function setExtraPack(pack: LanguagePack | null): void {
  active = pack;
}

/** "Afaan Oromoo: machine translated, may have mistakes." Shown in English so everyone can read why. */
export function machineNote(lang: ExtraLang): string {
  return `${EXTRA_LANGS[lang].name}: machine translated, may have mistakes.`;
}

function readCache(lang: string): LanguagePack | null {
  try {
    const raw = sessionStorage.getItem(`db-pack-${lang}`);
    return raw ? (JSON.parse(raw) as LanguagePack) : null;
  } catch {
    return null;
  }
}

function writeCache(pack: LanguagePack): void {
  try {
    sessionStorage.setItem(`db-pack-${pack.lang}`, JSON.stringify(pack));
  } catch {
    /* private mode or full: just fetch again next time */
  }
}

/** Fetch (once per page, cached for the tab) and activate a pack. Resolves false when nothing could be loaded. */
export async function loadExtraPack(lang: ExtraLang, apiUrl: string | undefined): Promise<boolean> {
  const cached = readCache(lang);
  if (cached) {
    setExtraPack(cached);
    return true;
  }
  if (!apiUrl) return false;
  if (!loading.has(lang)) {
    loading.set(
      lang,
      fetch(`${apiUrl}/i18n/${lang}`)
        .then((r) => (r.ok ? (r.json() as Promise<LanguagePack>) : null))
        .catch(() => null),
    );
  }
  const pack = await loading.get(lang)!;
  if (!pack || pack.lang !== lang || !pack.strings || Object.keys(pack.strings).length === 0) {
    loading.delete(lang);
    return false;
  }
  writeCache(pack);
  setExtraPack(pack);
  return true;
}

let packApiUrl: string | undefined;
let readyList: Promise<ExtraLang[]> | null = null;

/** Set by each widget so pickers can ask the same API which languages have text saved. */
export function setPackApiUrl(url: string | undefined): void {
  if (url !== packApiUrl) readyList = null;
  packApiUrl = url;
}

/** Added languages with at least one saved string, asked once per page. Empty when the API has none or is away. */
export function listReadyLangs(): Promise<ExtraLang[]> {
  if (!packApiUrl) return Promise.resolve([]);
  readyList ??= fetch(`${packApiUrl}/i18n`)
    .then((r) => (r.ok ? (r.json() as Promise<{ languages?: { lang: string; translated: number }[] }>) : null))
    .then((json) =>
      (json?.languages ?? []).filter((l) => isExtraLang(l.lang) && l.translated > 0).map((l) => l.lang as ExtraLang),
    )
    .catch(() => []);
  return readyList;
}

/** Ask the widget that holds `node` to switch to an added language, or back to English or Amharic. */
export function requestLang(node: Node | null, lang: string): void {
  const host = (node?.getRootNode() as ShadowRoot | undefined)?.host;
  host?.setAttribute('lang', lang);
}
