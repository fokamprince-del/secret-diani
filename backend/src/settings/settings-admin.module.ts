import { Body, Controller, Delete, Get, Module, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsDefined, Matches } from 'class-validator';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../common/auth/decorators';
import { PublicContent } from '../content/common/content.helpers';
import { SETTING_GROUP_LABELS } from './settings.registry';
import { type PublicSiteSettings, SettingsAdminService } from './settings-admin.service';

const KEY_PATTERN = /^[a-z_]+\.[a-z_]+$/;

class SettingKeyParams {
  @ApiProperty({ example: 'catering.deposit_below_cents' })
  @Matches(KEY_PATTERN, { message: 'fr: clé de paramètre invalide' })
  key!: string;
}

export class UpdateSettingDto {
  @ApiProperty({
    description: 'Nouvelle valeur, au format décrit par le schéma JSON du paramètre',
    example: 1500,
  })
  @IsDefined({ message: 'fr: la valeur est obligatoire' })
  value!: unknown;
}

export class SettingDto {
  @ApiProperty({ example: 'catering.deposit_below_cents' }) key!: string;
  @ApiProperty({ enum: Object.keys(SETTING_GROUP_LABELS) }) group!: string;
  @ApiProperty({ example: 'Traiteur' }) groupLabel!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ description: 'Valeur en vigueur (valeur par défaut si jamais modifiée)' })
  value!: unknown;
  @ApiProperty() defaultValue!: unknown;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Schéma JSON' })
  schema!: Record<string, unknown>;
  @ApiProperty({ nullable: true, type: Date }) updatedAt!: Date | null;
}

class SocialLinksDto {
  @ApiProperty() instagram!: string;
  @ApiProperty() tiktok!: string;
  @ApiProperty() facebook!: string;
  @ApiProperty() youtube!: string;
}

class AnnouncementDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() text!: string;
  @ApiProperty({ description: 'Chemin du site ou adresse https ; vide : pas de lien' })
  link!: string;
}

class SiteFeaturesDto {
  @ApiProperty({ description: 'Validation du panier de la boutique possible' })
  shopOpen!: boolean;
  @ApiProperty({ description: 'Achat des packs de formation possible' })
  courseSalesOpen!: boolean;
}

export class PublicSiteSettingsDto implements PublicSiteSettings {
  @ApiProperty({ description: 'Numéro WhatsApp (vide : bouton masqué)' }) whatsappNumber!: string;
  @ApiProperty() contactEmail!: string;
  @ApiProperty({ type: SocialLinksDto }) socialLinks!: SocialLinksDto;
  @ApiPropertyOptional({ type: AnnouncementDto, nullable: true })
  announcement!: AnnouncementDto | null;
  @ApiProperty({ type: SiteFeaturesDto }) features!: SiteFeaturesDto;
}

@ApiTags('Site')
@Controller('site')
export class SiteSettingsController {
  constructor(private readonly settings: SettingsAdminService) {}

  @Get('settings')
  @PublicContent()
  @ApiOperation({
    summary: 'Réglages publics du site (contact, réseaux, bandeau, ventes ouvertes)',
  })
  @ApiOkResponse({ type: PublicSiteSettingsDto })
  get(): Promise<PublicSiteSettingsDto> {
    return this.settings.publicSettings();
  }
}

@ApiTags('Administration — paramètres')
@ApiBearerAuth()
@ApiExtraModels(SettingDto)
@Roles('admin')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Tous les paramètres modifiables, avec valeur par défaut et schéma' })
  @ApiOkResponse({ type: [SettingDto] })
  list(): Promise<SettingDto[]> {
    return this.settings.list();
  }

  @Get(':key')
  @ApiOkResponse({ type: SettingDto })
  get(@Param() params: SettingKeyParams): Promise<SettingDto> {
    return this.settings.get(params.key);
  }

  @Put(':key')
  @ApiOperation({ summary: 'Modifier un paramètre (validé par son schéma, effet immédiat)' })
  @ApiOkResponse({ type: SettingDto })
  update(
    @Param() params: SettingKeyParams,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SettingDto> {
    return this.settings.update(params.key, dto.value, user.id);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Revenir à la valeur par défaut' })
  @ApiOkResponse({ type: SettingDto })
  reset(
    @Param() params: SettingKeyParams,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SettingDto> {
    return this.settings.reset(params.key, user.id);
  }
}

/** Paramètres du site : administration et lecture publique (API uniquement, pas le worker). */
@Module({
  controllers: [SiteSettingsController, AdminSettingsController],
  providers: [SettingsAdminService],
})
export class SettingsAdminModule {}
