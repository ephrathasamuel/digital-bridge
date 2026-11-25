import type { ExtraLang } from "@db/shared-schemas";
import { OM } from "./om";
import { TI } from "./ti";

/**
 * Machine translated packs kept in the repo, so a language works with no translation service configured.
 * Anyone can improve them with a pull request. A speaker's fix saved through the API wins over these.
 */
export const STATIC_PACKS: Partial<Record<ExtraLang, Record<string, string>>> = { om: OM, ti: TI };
