import { Injectable, Logger } from '@nestjs/common';
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

/**
 * Lecture typée des paramètres du site. Une valeur absente ou invalide (saisie erronée dans
 * l'administration) retombe sur la valeur par défaut, sans casser la page publique.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get<T>(definition: SettingDefinition<T>): Promise<T> {
    const [value] = await this.getMany([definition]);
    return value;
  }

  /** Lit plusieurs paramètres en une requête, dans l'ordre demandé. */
  async getMany<const D extends readonly SettingDefinition<unknown>[]>(
    definitions: D,
  ): Promise<{ [K in keyof D]: D[K] extends SettingDefinition<infer T> ? T : never }> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: definitions.map((definition) => definition.key) } },
      select: { key: true, value: true },
    });
    return definitions.map((definition) => {
      const row = rows.find((candidate) => candidate.key === definition.key);
      if (!row) return definition.defaultValue;
      const parsed = definition.schema.safeParse(row.value);
      if (parsed.success) return parsed.data;
      this.logger.warn(`Paramètre « ${definition.key} » invalide : valeur par défaut utilisée`);
      return definition.defaultValue;
    }) as { [K in keyof D]: D[K] extends SettingDefinition<infer T> ? T : never };
  }
}
