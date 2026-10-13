import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ContentCacheService } from '../content/cache/content-cache.service';
import { notFound } from '../content/common/content.helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONTACT_EMAIL,
  COURSE_SALES_OPEN,
  SHOP_OPEN,
  ANNOUNCEMENT,
  SOCIAL_LINKS,
} from './site.settings';
import { WHATSAPP_NUMBER } from '../catering/catering.settings';
import {
  type RegisteredSetting,
  SETTING_GROUP_LABELS,
  SETTINGS_REGISTRY,
  type SettingGroup,
} from './settings.registry';
import { SettingsService } from './settings.service';

export interface SettingView {
  key: string;
  group: SettingGroup;
  groupLabel: string;
  description: string;
  value: unknown;
  defaultValue: unknown;
  isDefault: boolean;
  /** Schéma JSON de la valeur attendue (génération du formulaire d'édition). */
  schema: Record<string, unknown>;
  updatedAt: Date | null;
}

export interface PublicSiteSettings {
  whatsappNumber: string;
  contactEmail: string;
  socialLinks: z.infer<typeof SOCIAL_LINKS.schema>;
  announcement: z.infer<typeof ANNOUNCEMENT.schema> | null;
  features: { shopOpen: boolean; courseSalesOpen: boolean };
}

/** Chemin d'une erreur Zod, à la manière des erreurs de validation des DTO (`value.text`). */
function fieldPath(path: readonly PropertyKey[]): string {
  return ['value', ...path.map(String)].join('.');
}

function invalidValue(error: z.ZodError): AppException {
  const byField = new Map<string, string[]>();
  for (const issue of error.issues) {
    const field = fieldPath(issue.path);
    byField.set(field, [...(byField.get(field) ?? []), issue.message]);
  }
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_ERROR,
    'Les données envoyées sont invalides.',
    [...byField].map(([field, messages]) => ({ field, messages })),
  );
}

/**
 * Paramètres du site modifiables sans déploiement : liste avec valeurs par défaut et schéma,
 * modification validée par le schéma du paramètre, retour à la valeur par défaut. Chaque
 * modification invalide le cache public, revalide les pages concernées et est journalisée.
 */
@Injectable()
export class SettingsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SettingView[]> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [...SETTINGS_REGISTRY.keys()] } },
      select: { key: true, updatedAt: true },
    });
    const values = await this.settings.getMany(
      [...SETTINGS_REGISTRY.values()].map((entry) => entry.definition),
    );
    return [...SETTINGS_REGISTRY.values()].map((entry, index) =>
      this.view(
        entry,
        values[index],
        rows.find((row) => row.key === entry.definition.key)?.updatedAt ?? null,
      ),
    );
  }

  async get(key: string): Promise<SettingView> {
    const entry = this.entry(key);
    const [value, row] = await Promise.all([
      this.settings.get(entry.definition),
      this.prisma.appSetting.findUnique({ where: { key }, select: { updatedAt: true } }),
    ]);
    return this.view(entry, value, row?.updatedAt ?? null);
  }

  async update(key: string, value: unknown, actorId: string): Promise<SettingView> {
    const entry = this.entry(key);
    const parsed = entry.definition.schema.safeParse(value);
    if (!parsed.success) throw invalidValue(parsed.error);
    const stored = parsed.data as Prisma.InputJsonValue;
    await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value: stored, description: entry.definition.description },
      update: { value: stored, description: entry.definition.description },
    });
    await this.changed(entry, AuditAction.SETTING_UPDATED, actorId);
    return this.get(key);
  }

  async reset(key: string, actorId: string): Promise<SettingView> {
    const entry = this.entry(key);
    await this.prisma.appSetting.deleteMany({ where: { key } });
    await this.changed(entry, AuditAction.SETTING_RESET, actorId);
    return this.get(key);
  }

  /** Paramètres lus par le frontend (pied de page, bandeau, boutons d'achat). */
  async publicSettings(): Promise<PublicSiteSettings> {
    return this.cache.getOrSet('site:settings', async () => {
      const [whatsappNumber, contactEmail, socialLinks, announcement, shopOpen, courseSalesOpen] =
        await this.settings.getMany([
          WHATSAPP_NUMBER,
          CONTACT_EMAIL,
          SOCIAL_LINKS,
          ANNOUNCEMENT,
          SHOP_OPEN,
          COURSE_SALES_OPEN,
        ]);
      return {
        whatsappNumber,
        contactEmail,
        socialLinks,
        announcement: announcement.enabled ? announcement : null,
        features: { shopOpen, courseSalesOpen },
      };
    });
  }

  private entry(key: string): RegisteredSetting {
    const entry = SETTINGS_REGISTRY.get(key);
    if (!entry) throw notFound('Paramètre inconnu.');
    return entry;
  }

  private view(entry: RegisteredSetting, value: unknown, updatedAt: Date | null): SettingView {
    const { definition, group } = entry;
    return {
      key: definition.key,
      group,
      groupLabel: SETTING_GROUP_LABELS[group],
      description: definition.description,
      value,
      defaultValue: definition.defaultValue,
      isDefault: updatedAt === null,
      schema: z.toJSONSchema(definition.schema, { io: 'input', unrepresentable: 'any' }),
      updatedAt,
    };
  }

  private async changed(entry: RegisteredSetting, action: AuditAction, actorId: string) {
    this.settings.invalidate(entry.definition.key);
    if (entry.cacheTags.length > 0) await this.cache.changed(entry.cacheTags);
    await this.audit.log({
      action,
      actorId,
      targetType: 'setting',
      metadata: { key: entry.definition.key },
    });
  }
}
