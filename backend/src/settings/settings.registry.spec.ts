import { z } from 'zod';
import { SETTINGS_REGISTRY } from './settings.registry';
import { HERO_IMAGE, UNIVERSES } from './home.settings';
import { ANNOUNCEMENT, CONTACT_EMAIL, SOCIAL_LINKS } from './site.settings';

describe('registre des paramètres du site', () => {
  const entries = [...SETTINGS_REGISTRY.values()];

  it('rassemble les paramètres du site, du traiteur et de la boutique', () => {
    const keys = [...SETTINGS_REGISTRY.keys()];
    expect(keys).toEqual(
      expect.arrayContaining([
        'site.name',
        'site.whatsapp_number',
        'site.announcement',
        'home.universes',
        'home.diani_word',
        'features.shop_open',
        'features.course_sales_open',
        'catering.deposit_below_cents',
        'shop.reservation_minutes',
        'legal.seller',
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(entries.map((entry) => [entry.definition.key, entry]))(
    '%s : valeur par défaut conforme, description et schéma JSON',
    (_key, entry) => {
      const { definition } = entry;
      expect(definition.schema.safeParse(definition.defaultValue).success).toBe(true);
      expect(definition.description.length).toBeGreaterThan(10);
      expect(definition.key).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(() => z.toJSONSchema(definition.schema, { unrepresentable: 'any' })).not.toThrow();
    },
  );

  it('revalide les pages publiques concernées, rien pour les mentions des factures', () => {
    expect(SETTINGS_REGISTRY.get('catering.conditions')!.cacheTags).toEqual(['catering']);
    expect(SETTINGS_REGISTRY.get('features.shop_open')!.cacheTags).toContain('shop');
    expect(SETTINGS_REGISTRY.get('site.name')!.cacheTags).toContain('articles');
    expect(SETTINGS_REGISTRY.get('legal.seller')!.cacheTags).toEqual([]);
    expect(SETTINGS_REGISTRY.get('home.universes')!.cacheTags).toEqual(['site']);
  });
});

describe('paramètres du site', () => {
  it('bandeau : texte obligatoire seulement quand il est affiché', () => {
    expect(ANNOUNCEMENT.schema.safeParse({ enabled: false, text: '', link: '' }).success).toBe(
      true,
    );
    const missing = ANNOUNCEMENT.schema.safeParse({ enabled: true, text: '  ', link: '' });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.path).toEqual(['text']);
    expect(
      ANNOUNCEMENT.schema.safeParse({ enabled: true, text: 'Soldes', link: '/boutique' }).success,
    ).toBe(true);
  });

  it('refuse les liens non https et les chemins douteux', () => {
    const links = { instagram: '', tiktok: '', facebook: '', youtube: '' };
    expect(SOCIAL_LINKS.schema.safeParse(links).success).toBe(true);
    expect(
      SOCIAL_LINKS.schema.safeParse({ ...links, instagram: 'http://instagram.com/x' }).success,
    ).toBe(false);
    expect(SOCIAL_LINKS.schema.safeParse({ ...links, tiktok: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    for (const link of ['//evil.example', '//evil', '/a b', 'javascript:alert(1)']) {
      expect(ANNOUNCEMENT.schema.safeParse({ enabled: true, text: 'x', link }).success).toBe(false);
    }
  });

  it('e-mail de contact : vide ou adresse valide', () => {
    expect(CONTACT_EMAIL.schema.safeParse('').success).toBe(true);
    expect(CONTACT_EMAIL.schema.safeParse('contact@lessecretsdediani.fr').success).toBe(true);
    expect(CONTACT_EMAIL.schema.safeParse('pas-un-email').success).toBe(false);
  });
});

describe('paramètres de l’accueil', () => {
  it('image : identifiant de la médiathèque ou vide, rien d’autre', () => {
    expect(HERO_IMAGE.schema.safeParse('').success).toBe(true);
    expect(HERO_IMAGE.schema.safeParse('01928f6e-7c1a-7b3e-9a6f-2f1c3d4e5f60').success).toBe(true);
    expect(HERO_IMAGE.schema.safeParse('https://exemple.com/image.jpg').success).toBe(false);
  });

  it('univers : texte court obligatoire pour chacun des trois', () => {
    const universes = structuredClone(UNIVERSES.defaultValue);
    universes.shop.text = '   ';
    expect(UNIVERSES.schema.safeParse(universes).success).toBe(false);
    universes.shop.text = 'x'.repeat(281);
    expect(UNIVERSES.schema.safeParse(universes).success).toBe(false);
  });
});
