import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import {
  EXTRA_LANGS,
  I18N,
  isExtraLang,
  nllbCode,
  protectPlaceholders,
  restorePlaceholders,
  type LanguagePack,
} from "@db/shared-schemas";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Repository } from "typeorm";
import { RequireScopes } from "../common/decorators/require-scopes.decorator";
import { throwBilingualHttp } from "../common/filters/bilingual-exception.filter";
import { ScopesGuard } from "../common/guards/scopes.guard";
import { STATIC_PACKS } from "./packs";
import { TranslationEntity } from "./translation.entity";

/**
 * One tap "add a language" (keys stay on the server, ENGINEERING_RULES.md §0.4).
 *
 * TRANSLATE_PROVIDER=nllb    Meta's NLLB 200 (200 languages incl. Afaan Oromo, Tigrinya, Somali). Calls
 *                            TRANSLATE_NLLB_URL (default: Hugging Face Inference, facebook/nllb-200-distilled-600M)
 *                            with HF_TOKEN, or a self hosted copy. The weights are CC BY NC 4.0: non commercial use.
 * TRANSLATE_PROVIDER=custom  LibreTranslate style service: POST TRANSLATE_URL {"q":[...],"source":"en","target"}
 *                            answering {"translatedText":[...]}. TRANSLATE_AUTH_HEADER is sent as Authorization.
 * Not set                    Generating answers 501. Saved packs and speaker fixes still work.
 */
const DEFAULT_NLLB_URL = "https://router.huggingface.co/hf-inference/models/facebook/nllb-200-distilled-600M";
const BATCH = 8;
const MAX_PER_CALL = 64;

export function buildTranslateRequest(
  env: NodeJS.ProcessEnv,
  texts: string[],
  lang: string,
): { url: string; init: RequestInit } | null {
  const provider = (env.TRANSLATE_PROVIDER || "").toLowerCase();
  const target = nllbCode(lang);
  if (!target) return null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "nllb") {
    if (env.HF_TOKEN) headers.Authorization = `Bearer ${env.HF_TOKEN}`;
    const body = { inputs: texts, parameters: { src_lang: "eng_Latn", tgt_lang: target } };
    return { url: env.TRANSLATE_NLLB_URL || DEFAULT_NLLB_URL, init: { method: "POST", headers, body: JSON.stringify(body) } };
  }
  if (provider === "custom" && env.TRANSLATE_URL) {
    if (env.TRANSLATE_AUTH_HEADER) headers.Authorization = env.TRANSLATE_AUTH_HEADER;
    const body = { q: texts, source: "en", target: lang, format: "text" };
    return { url: env.TRANSLATE_URL, init: { method: "POST", headers, body: JSON.stringify(body) } };
  }
  return null;
}

/** Read either answer shape into a list the same length as the input, or null when it does not fit. */
export function readTranslations(json: unknown, count: number): string[] | null {
  let list: unknown[] | null = null;
  if (Array.isArray(json)) list = json.map((item) => (Array.isArray(item) ? item[0] : item));
  else if (json && typeof json === "object" && "translatedText" in json) {
    const value = (json as { translatedText: unknown }).translatedText;
    list = Array.isArray(value) ? value : [value];
  }
  if (!list || list.length !== count) return null;
  const out = list.map((item) =>
    typeof item === "string" ? item : (item as { translation_text?: unknown })?.translation_text,
  );
  return out.every((s) => typeof s === "string" && s.trim()) ? (out as string[]) : null;
}

class FixDto {
  @ApiProperty({ example: "Galmeessuuf eenyummaan hin barbaachisu.", maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}

const englishPack = I18N.en as Record<string, string>;

/** The repo pack for a language, keeping only keys that still exist and whose {placeholders} match English. */
export function staticPack(lang: string): Record<string, string> {
  const pack = (STATIC_PACKS as Record<string, Record<string, string> | undefined>)[lang] ?? {};
  const names = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join();
  return Object.fromEntries(
    Object.entries(pack).filter(([key, text]) => key in englishPack && names(text) === names(englishPack[key])),
  );
}

@ApiTags("i18n")
@Controller("i18n")
class TranslateController {
  constructor(@InjectRepository(TranslationEntity) private readonly repo: Repository<TranslationEntity>) {}

  @Get()
  @ApiOperation({ summary: "Languages that can be added, with how many strings are translated and checked" })
  async languages() {
    const rows = await this.repo.find({ select: { lang: true, source: true } });
    const total = Object.keys(englishPack).length;
    return {
      provider: buildTranslateRequest(process.env, ["x"], "om") ? (process.env.TRANSLATE_PROVIDER || "").toLowerCase() : "none",
      languages: Object.entries(EXTRA_LANGS).map(([lang, info]) => {
        const saved = rows.filter((r) => r.lang === lang);
        const keys = new Set([...Object.keys(staticPack(lang)), ...saved.map((r) => r.key)]);
        return {
          lang,
          name: info.name,
          total,
          translated: keys.size,
          checked: saved.filter((r) => r.source === "person").length,
        };
      }),
    };
  }

  @Get(":lang")
  @ApiOperation({ summary: "The saved language pack: translated strings, and which a speaker has checked" })
  async pack(@Param("lang") lang: string): Promise<LanguagePack> {
    if (!isExtraLang(lang)) throwBilingualHttp(HttpStatus.NOT_FOUND, undefined, "NotFound");
    const rows = await this.repo.find({ where: { lang } });
    const inRepo = staticPack(lang);
    const strings: Record<string, string> = { ...inRepo };
    const checked: string[] = [];
    // A speaker's fix wins, then the repo pack, then text the machine made on this server.
    for (const row of rows) {
      if (!(row.key in englishPack)) continue;
      if (row.source !== "person" && row.key in inRepo) continue;
      strings[row.key] = row.text;
      if (row.source === "person") checked.push(row.key);
    }
    return { lang, strings, checked };
  }

  @Post(":lang/generate")
  @HttpCode(200)
  @UseGuards(ScopesGuard)
  @RequireScopes("i18n:edit")
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: "Machine translate the next missing or out of date strings (scope i18n:edit). Call again until remaining is 0",
  })
  async generate(@Param("lang") lang: string): Promise<{ translated: number; skipped: number; remaining: number }> {
    if (!isExtraLang(lang)) throwBilingualHttp(HttpStatus.NOT_FOUND, undefined, "NotFound");
    if (!buildTranslateRequest(process.env, ["x"], lang)) throwBilingualHttp(HttpStatus.NOT_IMPLEMENTED, undefined, "InternalError");
    const saved = new Map((await this.repo.find({ where: { lang } })).map((r) => [r.key, r]));
    const inRepo = staticPack(lang);
    // Missing, or machine made from English that has since changed. A speaker's text is never overwritten,
    // and strings already in the repo pack are not sent to the machine.
    const todo = Object.entries(englishPack).filter(([key, en]) => {
      const row = saved.get(key);
      if (!row) return !(key in inRepo);
      return row.source === "machine" && row.english !== en;
    });
    const now = todo.slice(0, MAX_PER_CALL);
    let translated = 0;
    let skipped = 0;
    for (let i = 0; i < now.length; i += BATCH) {
      const batch = now.slice(i, i + BATCH);
      const protectedTexts = batch.map(([, en]) => protectPlaceholders(en));
      const request = buildTranslateRequest(process.env, protectedTexts.map((p) => p.text), lang)!;
      let json: unknown;
      try {
        const upstream = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(30_000) });
        if (!upstream.ok) throw new Error(String(upstream.status));
        json = await upstream.json();
      } catch {
        throwBilingualHttp(HttpStatus.BAD_GATEWAY, undefined, "InternalError");
      }
      const out = readTranslations(json, batch.length);
      if (!out) throwBilingualHttp(HttpStatus.BAD_GATEWAY, undefined, "InternalError");
      const rows: TranslationEntity[] = [];
      batch.forEach(([key, en], j) => {
        const text = restorePlaceholders(out![j], protectedTexts[j].names);
        // A lost {placeholder} would break the sentence: leave the key out so English shows instead.
        if (text === null) { skipped++; return; }
        rows.push({ lang, key, text, source: "machine", english: en, updatedAt: new Date().toISOString() });
      });
      await this.repo.save(rows);
      translated += rows.length;
    }
    return { translated, skipped, remaining: todo.length - now.length };
  }

  @Put(":lang/:key")
  @UseGuards(ScopesGuard)
  @RequireScopes("i18n:edit")
  @ApiBearerAuth()
  @ApiOperation({ summary: "A speaker fixes or confirms one string (scope i18n:edit); it is then marked as checked" })
  async fix(@Param("lang") lang: string, @Param("key") key: string, @Body() body: FixDto): Promise<{ key: string; text: string }> {
    if (!isExtraLang(lang) || !(key in englishPack)) throwBilingualHttp(HttpStatus.NOT_FOUND, undefined, "NotFound");
    const english = englishPack[key];
    const wanted = (english.match(/\{\w+\}/g) ?? []).sort().join();
    const given = (body.text.match(/\{\w+\}/g) ?? []).sort().join();
    if (wanted !== given) throwBilingualHttp(HttpStatus.UNPROCESSABLE_ENTITY, "REQUIRED", "ValidationError");
    const text = body.text.trim();
    await this.repo.save({ lang, key, text, source: "person", english, updatedAt: new Date().toISOString() });
    return { key, text };
  }
}

@Module({ imports: [TypeOrmModule.forFeature([TranslationEntity])], controllers: [TranslateController] })
export class TranslateModule {}
