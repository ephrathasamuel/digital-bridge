import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post, Res } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import type { Response } from "express";
import { throwBilingualHttp } from "../common/filters/bilingual-exception.filter";

/**
 * Read aloud voices for any language, without keys in the browser (ENGINEERING_RULES.md §0.4).
 *
 * TTS_PROVIDER=mms     Meta's open source MMS voices (1,100+ languages, e.g. facebook/mms-tts-amh). Calls
 *                      TTS_MMS_URL (default: Hugging Face Inference API, {lang} is the ISO 639-3 code) with
 *                      HF_TOKEN, or a self hosted copy of the same models.
 * TTS_PROVIDER=custom  Any text to speech service. TTS_URL may hold {text} and {lang}: then it is a GET request,
 *                      otherwise a POST of {"text","lang"}. TTS_AUTH_HEADER (e.g. "Bearer abc") is sent as
 *                      Authorization. Works with OpenTTS, a Piper HTTP server, or a paid provider behind a proxy.
 * Not set              The route answers 501 and the widgets fall back to device voices and captions.
 * Text is never logged or stored.
 */
const ISO_639_3: Record<string, string> = {
  en: "eng", am: "amh", om: "orm", ti: "tir", so: "som", sw: "swh", ar: "ara", fr: "fra", es: "spa", pt: "por",
  de: "deu", hi: "hin", zh: "cmn", ha: "hau", yo: "yor", ig: "ibo", zu: "zul", rw: "kin", aa: "aar", sid: "sid",
};

export function toIso6393(lang: string): string {
  const base = lang.toLowerCase().split(/[-_]/)[0];
  return ISO_639_3[base] ?? base;
}

export function buildTtsRequest(
  env: NodeJS.ProcessEnv,
  text: string,
  lang: string,
): { url: string; init: RequestInit } | null {
  const provider = (env.TTS_PROVIDER || "").toLowerCase();
  const headers: Record<string, string> = {};
  if (provider === "mms") {
    const template = env.TTS_MMS_URL || "https://api-inference.huggingface.co/models/facebook/mms-tts-{lang}";
    if (env.HF_TOKEN) headers.Authorization = `Bearer ${env.HF_TOKEN}`;
    headers["Content-Type"] = "application/json";
    return {
      url: template.replace("{lang}", encodeURIComponent(toIso6393(lang))),
      init: { method: "POST", headers, body: JSON.stringify({ inputs: text }) },
    };
  }
  if (provider === "custom" && env.TTS_URL) {
    if (env.TTS_AUTH_HEADER) headers.Authorization = env.TTS_AUTH_HEADER;
    if (env.TTS_URL.includes("{text}")) {
      const url = env.TTS_URL.replace("{text}", encodeURIComponent(text)).replace("{lang}", encodeURIComponent(lang));
      return { url, init: { method: "GET", headers } };
    }
    headers["Content-Type"] = "application/json";
    return { url: env.TTS_URL, init: { method: "POST", headers, body: JSON.stringify({ text, lang }) } };
  }
  return null;
}

class SpeakDto {
  @ApiProperty({ example: "ለመመዝገብ መታወቂያ አያስፈልግም።", maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;

  @ApiPropertyOptional({ example: "am", description: "BCP 47 or ISO 639 code. Defaults to en." })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z]{2,3}([-_][a-zA-Z0-9]{2,8})*$/)
  lang?: string;
}

@ApiTags("voice")
@Controller("voice")
class VoiceController {
  @Get()
  @ApiOperation({ summary: "Which read aloud voice provider this server has (none, mms or custom)" })
  status(): { provider: string } {
    return { provider: buildTtsRequest(process.env, "x", "en") ? (process.env.TTS_PROVIDER || "").toLowerCase() : "none" };
  }

  @Post("speak")
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: "Turn text into speech in any language; returns audio (501 when no provider is set)" })
  async speak(@Body() body: SpeakDto, @Res() res: Response): Promise<void> {
    const request = buildTtsRequest(process.env, body.text, body.lang || "en");
    if (!request) throwBilingualHttp(HttpStatus.NOT_IMPLEMENTED, undefined, "InternalError");
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(request!.url, { ...request!.init, signal: AbortSignal.timeout(20_000) });
    } catch {
      throwBilingualHttp(HttpStatus.BAD_GATEWAY, undefined, "InternalError");
    }
    const type = upstream!.headers.get("content-type") || "";
    if (!upstream!.ok || !/^audio\//.test(type)) throwBilingualHttp(HttpStatus.BAD_GATEWAY, undefined, "InternalError");
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(Buffer.from(await upstream!.arrayBuffer()));
  }
}

@Module({ controllers: [VoiceController] })
export class VoiceModule {}
