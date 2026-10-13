import {
  Body,
  Controller,
  Delete,
  Get,
  Global,
  Header,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { NewsletterStatus } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Equals, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { clientContext } from '../common/auth/client-context';
import { CaptchaService } from '../common/captcha/captcha.service';
import { CurrentUser, Public, Roles } from '../common/auth/decorators';
import { CursorQueryDto } from '../common/pagination/cursor';
import { NormalizeEmail } from '../common/utils/transforms';
import { MessageDto } from '../contact/contact.module';
import { CONSENT_TEXT, NewsletterService, SUBSCRIBE_MESSAGE } from './newsletter.service';

const TOKEN = { message: 'fr: lien invalide' };

export class SubscribeDto {
  @ApiProperty({ example: 'awa@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ description: `Case de consentement cochée : « ${CONSENT_TEXT} »` })
  @Equals(true, { message: 'fr: le consentement est nécessaire pour s’inscrire' })
  consent!: boolean;

  @ApiPropertyOptional({ description: 'Jeton Cloudflare Turnstile (obligatoire en production)' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;

  @ApiPropertyOptional({ description: 'Piège à robots : toujours vide pour un humain' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}

export class NewsletterTokenDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,100}$/, TOKEN)
  token!: string;
}

export class SubscriberQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: NewsletterStatus })
  @IsOptional()
  @IsEnum(NewsletterStatus)
  status?: NewsletterStatus;
}

export class SubscriberDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: NewsletterStatus }) status!: NewsletterStatus;
  @ApiProperty({ enum: ['form', 'account'] }) source!: string;
  @ApiProperty() requestedAt!: Date;
  @ApiProperty({ nullable: true, type: Date }) confirmedAt!: Date | null;
  @ApiProperty({ nullable: true, type: Date }) unsubscribedAt!: Date | null;
}

export class SubscriberListDto {
  @ApiProperty({ type: [SubscriberDto] }) items!: SubscriberDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

@ApiTags('Newsletter')
@Controller('newsletter')
@Public()
export class NewsletterController {
  constructor(
    private readonly newsletter: NewsletterService,
    private readonly captcha: CaptchaService,
  ) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @ApiOperation({
    summary: 'S’inscrire (double opt-in : un e-mail de confirmation est envoyé)',
    description: 'Réponse identique que l’adresse soit déjà inscrite ou non.',
  })
  @ApiAcceptedResponse({ type: MessageDto })
  async subscribe(@Body() dto: SubscribeDto, @Req() req: Request): Promise<MessageDto> {
    if (dto.website) return { message: SUBSCRIBE_MESSAGE };
    const client = clientContext(req);
    await this.captcha.verify(dto.captchaToken, client.ip);
    return this.newsletter.subscribe(dto.email, client);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Confirmer l’inscription (lien reçu par e-mail, 7 jours, usage unique)',
  })
  @ApiOkResponse({ type: MessageDto })
  confirm(@Body() dto: NewsletterTokenDto, @Req() req: Request): Promise<MessageDto> {
    return this.newsletter.confirm(dto.token, clientContext(req));
  }

  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Se désinscrire (lien signé présent dans chaque e-mail)' })
  @ApiOkResponse({ type: MessageDto })
  unsubscribe(@Body() dto: NewsletterTokenDto): Promise<MessageDto> {
    return this.newsletter.unsubscribe(dto.token);
  }

  /** Désinscription en un clic depuis la messagerie (RFC 8058) : corps « List-Unsubscribe=One-Click » ignoré. */
  @Post('unsubscribe/one-click')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Désinscription en un clic (bouton de la messagerie, RFC 8058)' })
  @ApiOkResponse({ type: MessageDto })
  oneClick(@Query() query: NewsletterTokenDto): Promise<MessageDto> {
    return this.newsletter.unsubscribe(query.token);
  }
}

@ApiTags('Administration — newsletter')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/newsletter/subscribers')
export class AdminNewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Get()
  @ApiOkResponse({ type: SubscriberListDto })
  list(@Query() query: SubscriberQueryDto): Promise<SubscriberListDto> {
    return this.newsletter.list(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="newsletter.csv"')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Export CSV des abonné·es confirmé·es, avec la preuve du consentement' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ type: String })
  export(@CurrentUser() user: AuthenticatedUser): Promise<string> {
    return this.newsletter.exportCsv(user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Effacer un·e abonné·e (droit à l’effacement)' })
  @ApiNoContentResponse()
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.newsletter.remove(id, user.id);
  }
}

/** Newsletter (double opt-in). Global : le compte synchronise la préférence « recevoir les nouvelles ». */
@Global()
@Module({
  controllers: [NewsletterController, AdminNewsletterController],
  providers: [NewsletterService],
  exports: [NewsletterService],
})
export class NewsletterModule {}
