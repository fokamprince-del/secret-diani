import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { ContactStatus, ContactSubject } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { clientContext } from '../common/auth/client-context';
import { CurrentUser, Public, Roles } from '../common/auth/decorators';
import { CursorQueryDto } from '../common/pagination/cursor';
import { EmptyToNull, NormalizeEmail, Trim } from '../common/utils/transforms';
import { PHONE_PATTERN } from '../users/dto/profile.dto';
import { ContactService } from './contact.service';

export class ContactDto {
  @ApiProperty({ example: 'Awa Diallo' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'awa@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '+33612345678' })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'fr: doit être un numéro de téléphone valide' })
  phone?: string | null;

  @ApiProperty({ enum: ContactSubject })
  @IsEnum(ContactSubject)
  subject!: ContactSubject;

  @ApiProperty({ minLength: 10, maxLength: 5000 })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message!: string;

  @ApiPropertyOptional({ description: 'Jeton Cloudflare Turnstile (obligatoire en production)' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;

  @ApiPropertyOptional({
    description: 'Piège à robots : champ caché, toujours vide pour un humain',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}

export class MessageDto {
  @ApiProperty()
  message!: string;
}

export class ContactQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: ContactStatus })
  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;
}

export class UpdateContactDto {
  @ApiPropertyOptional({ enum: ContactStatus })
  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(2000)
  adminNote?: string | null;
}

export class ContactMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ enum: ContactSubject }) subject!: ContactSubject;
  @ApiProperty() message!: string;
  @ApiProperty({ enum: ContactStatus }) status!: ContactStatus;
  @ApiProperty({ nullable: true, type: String }) adminNote!: string | null;
  @ApiProperty({ nullable: true, type: Date }) handledAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class ContactMessageListDto {
  @ApiProperty({ type: [ContactMessageDto] }) items!: ContactMessageDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 10 * 60_000 } })
  @ApiOperation({
    summary: 'Envoyer un message à Diani',
    description:
      'Anti-spam : limitation de débit, piège à robots (`website`), Cloudflare Turnstile. Accusé de réception par e-mail.',
  })
  @ApiCreatedResponse({ type: MessageDto })
  send(@Body() dto: ContactDto, @Req() req: Request): Promise<MessageDto> {
    return this.contact.submit(dto, clientContext(req));
  }
}

@ApiTags('Administration — contact')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/contact-messages')
export class AdminContactController {
  constructor(private readonly contact: ContactService) {}

  @Get()
  @ApiOkResponse({ type: ContactMessageListDto })
  list(@Query() query: ContactQueryDto): Promise<ContactMessageListDto> {
    return this.contact.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ContactMessageDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ContactMessageDto> {
    return this.contact.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Suivi : lu, répondu, archivé ; note interne' })
  @ApiOkResponse({ type: ContactMessageDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContactMessageDto> {
    return this.contact.update(id, dto, user.id);
  }
}

/** Formulaire de contact (public) et suivi des messages (administration). */
@Module({
  controllers: [ContactController, AdminContactController],
  providers: [ContactService],
})
export class ContactModule {}
