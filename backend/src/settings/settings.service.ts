import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Définition d'un paramètre du site : clé, schéma de validation et valeur par défaut sûre.
 * Les valeurs sont modifiables sans déploiement (table `app_settings`, back-office en phase 9).
 */
export interface SettingDefinition<T> {
  key: string;
  schema: z.ZodType<T>;
  defaultValue: T;
  description: string;
}

export function defineSetting<T>(definition: SettingDefinition<T>): SettingDefinition<T> {
  return definition;
}

/** Durée de vie du cache mémoire des paramètres (D-092). */
export const SETTINGS_CACHE_MS = 5_000;

/**
 * Lecture typée des paramètres du site. Une valeur absente ou invalide (saisie erronée dans
 * l'administration) retombe sur la valeur par défaut, sans casser la page publique.
 *
 * Les valeurs brutes sont gardées 5 secondes en mémoire : un panier ou une commande lit
 * plusieurs paramètres, plusieurs fois par requête. Une modification depuis l'administration
 * vide le cache du processus qui la reçoit ; les autres processus la voient sous 5 secondes.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<string, { raw: Prisma.JsonValue | undefined; until: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Oublie une valeur (ou toutes) : relue en base à la prochaine lecture. */
  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  async get<T>(definition: SettingDefinition<T>): Promise<T> {
    const [value] = await this.getMany([definition]);
    return value;
  }

  /** Lit plusieurs paramètres en une requête, dans l'ordre demandé. */
  async getMany<const D extends readonly SettingDefinition<unknown>[]>(
    definitions: D,
  ): Promise<{ [K in keyof D]: D[K] extends SettingDefinition<infer T> ? T : never }> {
    const now = Date.now();
    const missing = definitions.filter(
      (definition) => (this.cache.get(definition.key)?.until ?? 0) <= now,
    );
    if (missing.length > 0) {
      const rows = await this.prisma.appSetting.findMany({
        where: { key: { in: missing.map((definition) => definition.key) } },
        select: { key: true, value: true },
      });
      for (const definition of missing) {
        const raw = rows.find((row) => row.key === definition.key)?.value;
        this.cache.set(definition.key, { raw, until: now + SETTINGS_CACHE_MS });
      }
    }
    return definitions.map((definition) => {
      const raw = this.cache.get(definition.key)?.raw;
      if (raw === undefined) return definition.defaultValue;
      const parsed = definition.schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      this.logger.warn(`Paramètre « ${definition.key} » invalide : valeur par défaut utilisée`);
      return definition.defaultValue;
    }) as { [K in keyof D]: D[K] extends SettingDefinition<infer T> ? T : never };
  }
}
