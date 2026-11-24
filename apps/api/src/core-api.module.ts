import { Controller, Get, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule, type TypeOrmModuleOptions } from "@nestjs/typeorm";
import * as fs from "fs";
import * as path from "path";
import { BilingualExceptionFilter } from "./common/filters/bilingual-exception.filter";
import { AuthModule } from "./auth/auth.module";
import { ApplicationEntity } from "./career/entities/application.entity";
import { JobEntity } from "./career/entities/job.entity";
import { CareerModule } from "./career/career.module";
import { HelpContactRequestEntity } from "./help/entities/help-contact-request.entity";
import { HelpModule } from "./help/help.module";
import { OnboardingSessionEntity } from "./onboarding/entities/onboarding-session.entity";
import { SupportPreferenceEntity } from "./onboarding/entities/support-preference.entity";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { SmsResumeTokenEntity } from "./sms/entities/sms-resume-token.entity";
import { SmsModule } from "./sms/sms.module";
import { SeedModule } from "./seed/seed.module";
import { PartnerVoucherEntity } from "./vouch/entities/partner-voucher.entity";
import { TranslationEntity } from "./translate/translation.entity";
import { TranslateModule } from "./translate/translate.module";
import { VoiceModule } from "./voice/voice.module";
import { VouchModule } from "./vouch/vouch.module";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const ENTITIES = [
  OnboardingSessionEntity,
  SupportPreferenceEntity,
  SmsResumeTokenEntity,
  PartnerVoucherEntity,
  JobEntity,
  ApplicationEntity,
  HelpContactRequestEntity,
  TranslationEntity,
];

/**
 * DATABASE_URL set (for example a free Neon Postgres): data survives restarts, which Render's free plan needs.
 * Not set: a local SQLite file in ./data, as before. Tables are created automatically in both cases.
 */
function databaseOptions(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL;
  if (url) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    return {
      type: "postgres",
      url,
      ssl: local || process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
      synchronize: true,
      entities: ENTITIES,
    };
  }
  return {
    type: "sqljs",
    location: path.join(dataDir, "digital_bridge.sqlite"),
    autoSave: true,
    synchronize: true,
    entities: ENTITIES,
  };
}

@Controller("health")
class HealthController {
  @Get()
  check() {
    // Which kind of database is in use (never the address), so a deploy can be checked from outside.
    return { status: "ok", version: "v1", database: process.env.DATABASE_URL ? "postgres" : "sqlite" };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    AuthModule,
    TypeOrmModule.forRoot(databaseOptions()),
    OnboardingModule,
    SmsModule,
    VouchModule,
    CareerModule,
    PrivacyModule,
    SeedModule,
    HelpModule,
    VoiceModule,
    TranslateModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: BilingualExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class CoreApiModule {}
