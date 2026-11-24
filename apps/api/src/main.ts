// apps/api/src/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { Module, ValidationPipe } from '@nestjs/common';
import type { CorsOptionsDelegate } from "@nestjs/common/interfaces/external/cors-options.interface";
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CoreApiModule } from './core-api.module';
import { LtiModule } from './lti/lti.module';

@Module({
  imports: [CoreApiModule, LtiModule],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix("api/v1");
  const corsOrigins = (process.env.CORS_ORIGINS ||
    "http://localhost:5173,http://localhost:8080,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:8080")
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigin = (origin: string | undefined): boolean => {
    if (!origin || corsOrigins.includes(origin)) return true;
    try {
      return new URL(origin).hostname.endsWith('.vercel.app');
    } catch {
      return false;
    }
  };
  // The read aloud route is public, rate limited and cookie free, so the help bar may call it from any website
  // (the browser extension runs on LinkedIn, job boards, etc.). Every other route keeps the allow-list above.
  const corsFor: CorsOptionsDelegate<{ url?: string; headers: { origin?: string } }> = (req, callback) => {
    const origin = req.headers.origin;
    // Public, no cookies: read aloud audio, and language packs (GET only; changing them needs a bearer token).
    const url = req.url ?? '';
    const isPackRead = url.startsWith('/api/v1/i18n') && !('authorization' in req.headers);
    if (url.startsWith('/api/v1/voice') || isPackRead) {
      callback(null, { origin: true, credentials: false });
      return;
    }
    if (allowedOrigin(origin)) callback(null, { origin: true, credentials: true });
    else callback(new Error('Origin not allowed by CORS'), { origin: false });
  };
  app.enableCors(corsFor);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle("Digital Bridge Accessible Onboarding & Career Gateway API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);
  SwaggerModule.setup("api/docs", app, document);
  const docsDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "openapi.json"), JSON.stringify(document, null, 2), "utf8");

  await app.listen(Number(process.env.PORT) || 3000, "0.0.0.0");
}
bootstrap();
