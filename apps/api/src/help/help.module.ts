import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { randomUUID } from "crypto";
import { Repository } from "typeorm";
import {
  answerHelpQuestion, HELP_CONTACT_LIMITS, HELP_ENTRIES, validateHelpContact,
  type HelpAnswer, type HelpContactReceipt, type HelpLang,
} from "@db/shared-schemas";
import { RequireScopes } from "../common/decorators/require-scopes.decorator";
import { throwBilingualHttp } from "../common/filters/bilingual-exception.filter";
import { ScopesGuard } from "../common/guards/scopes.guard";
import { HelpContactRequestEntity } from "./entities/help-contact-request.entity";

class AskQuestionDto {
  @ApiProperty({ example: "Do I need an ID to sign up?", description: "English or Amharic. The answer uses the same language." })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question!: string;

  @ApiPropertyOptional({ enum: ["en", "am"], description: "Used only when the question has no letters to detect." })
  @IsOptional()
  @IsIn(["en", "am"])
  lang?: HelpLang;
}

class FaqQueryDto {
  @ApiPropertyOptional({ enum: ["en", "am"] })
  @IsOptional()
  @IsIn(["en", "am"])
  lang?: HelpLang;
}

class ContactPersonDto {
  @ApiPropertyOptional({ example: "Hana", maxLength: HELP_CONTACT_LIMITS.name })
  @IsOptional()
  @IsString()
  @MaxLength(HELP_CONTACT_LIMITS.name)
  name?: string;

  @ApiProperty({ example: "0911 234 567", description: "Ethiopian phone number or email address, so the help team can reply." })
  @IsString()
  @MaxLength(HELP_CONTACT_LIMITS.contact)
  contact!: string;

  @ApiProperty({ example: "I cannot find the sign language option.", maxLength: HELP_CONTACT_LIMITS.message })
  @IsString()
  @MaxLength(HELP_CONTACT_LIMITS.message)
  message!: string;

  @ApiPropertyOptional({ enum: ["en", "am"] })
  @IsOptional()
  @IsIn(["en", "am"])
  lang?: HelpLang;

  @ApiProperty({ description: "Must be true: the learner agreed that the help team may keep the message to reply." })
  @IsBoolean()
  consent!: boolean;
}

/** Bilingual help: the same answers the <db-ask> widget gives offline. Questions are never stored or logged. */
@ApiTags("help")
@Controller("help")
class HelpController {
  constructor(
    @InjectRepository(HelpContactRequestEntity)
    private readonly contactRepo: Repository<HelpContactRequestEntity>,
  ) {}

  @Post("ask")
  @HttpCode(200)
  @ApiOperation({ summary: "Ask a question in English or Amharic and get an answer in the same language" })
  ask(@Body() body: AskQuestionDto): HelpAnswer {
    return answerHelpQuestion(body.question, body.lang ?? "en");
  }

  @Get("faq")
  @ApiOperation({ summary: "List the common questions and answers in one language" })
  faq(@Query() query: FaqQueryDto): Array<{ id: string; question: string; answer: string }> {
    const lang = query.lang ?? "en";
    return HELP_ENTRIES.map((entry) => ({ id: entry.id, question: entry.question[lang], answer: entry.answer[lang] }));
  }

  @Post("contact")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Contact a person: leave a message and a phone or email for the help team (consent required)" })
  async contact(@Body() body: ContactPersonDto): Promise<HelpContactReceipt> {
    if (body.consent !== true) throwBilingualHttp(HttpStatus.UNPROCESSABLE_ENTITY, "CONSENT_REQUIRED", "ValidationError");
    const checked = validateHelpContact({ ...body, lang: body.lang ?? "en" });
    if (!checked.ok) {
      const code = checked.errors.contact === "invalid" ? "INVALID_ET_PHONE" : "REQUIRED";
      throwBilingualHttp(HttpStatus.UNPROCESSABLE_ENTITY, code, "ValidationError");
    }
    const now = new Date().toISOString();
    const receipt: HelpContactReceipt = { reference: "HELP-" + randomUUID().slice(0, 8).toUpperCase(), receivedAt: now };
    // Never log the message or contact details: they are personal data kept only for the reply.
    await this.contactRepo.save({
      reference: receipt.reference,
      name: checked.value.name ?? null,
      contactKind: checked.value.contactKind,
      contact: checked.value.contact,
      message: checked.value.message,
      lang: checked.value.lang,
      consentGivenAt: now,
      receivedAt: now,
      status: "new",
    });
    return receipt;
  }

  @Get("contact")
  @UseGuards(ScopesGuard)
  @RequireScopes("help:admin")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Help team: list Contact a person messages, newest first (scope help:admin)" })
  async listContacts(): Promise<HelpContactRequestEntity[]> {
    return this.contactRepo.find({ order: { receivedAt: "DESC" }, take: 200 });
  }
}

@Module({ imports: [TypeOrmModule.forFeature([HelpContactRequestEntity])], controllers: [HelpController] })
export class HelpModule {}
