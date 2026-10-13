import * as catering from '../catering/catering.settings';
import type { ContentTag } from '../content/cache/content-cache.service';
import * as shop from '../shop/shop.settings';
import * as home from './home.settings';
import type { SettingDefinition } from './settings.service';
import * as site from './site.settings';

export type SettingGroup = 'site' | 'home' | 'features' | 'catering' | 'shop' | 'legal';

export const SETTING_GROUP_LABELS: Record<SettingGroup, string> = {
  site: 'Site',
  home: 'Accueil',
  features: 'Fonctionnalités',
  catering: 'Traiteur',
  shop: 'Boutique',
  legal: 'Mentions légales',
};

/**
 * Pages du frontend à revalider quand un paramètre du groupe change. Le cache Redis des
 * contenus, lui, est invalidé en entier à chaque modification (numéro de version).
 */
const GROUP_TAGS: Record<SettingGroup, ContentTag[]> = {
  site: ['site', 'articles', 'pages', 'faq', 'catering', 'shop', 'courses'],
  home: ['site'],
  features: ['site', 'shop', 'courses'],
  catering: ['catering'],
  shop: ['shop'],
  legal: [],
};

export interface RegisteredSetting {
  definition: SettingDefinition<unknown>;
  group: SettingGroup;
  cacheTags: ContentTag[];
}

function isDefinition(value: unknown): value is SettingDefinition<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'key' in value &&
    'schema' in value &&
    'defaultValue' in value
  );
}

function groupOf(key: string): SettingGroup {
  const prefix = key.split('.')[0];
  if (prefix && prefix in SETTING_GROUP_LABELS) return prefix as SettingGroup;
  throw new Error(`Paramètre « ${key} » : groupe inconnu`);
}

/**
 * Tous les paramètres modifiables depuis l'administration, déclarés là où ils sont utilisés
 * (`*.settings.ts`). Une clé absente de ce registre n'est ni lisible ni modifiable par l'API.
 */
export const SETTINGS_REGISTRY: ReadonlyMap<string, RegisteredSetting> = new Map(
  [
    ...Object.values(site),
    ...Object.values(home),
    ...Object.values(catering),
    ...Object.values(shop),
  ]
    .filter(isDefinition)
    .map((definition) => {
      const group = groupOf(definition.key);
      return [definition.key, { definition, group, cacheTags: GROUP_TAGS[group] }];
    }),
);
