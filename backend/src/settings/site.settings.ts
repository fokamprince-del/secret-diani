import { z } from 'zod';
import { defineSetting } from './settings.service';

const emptyOr = <T extends z.ZodType>(schema: T) => z.union([z.literal(''), schema]);
const httpsUrl = z.url({ protocol: /^https$/ }).max(500);

export const SITE_NAME = defineSetting({
  key: 'site.name',
  schema: z.string().trim().min(1).max(120),
  defaultValue: 'Les Secrets de Diani',
  description: 'Nom de la marque (titres, données structurées, certificats).',
});

export const AUTHOR_NAME = defineSetting({
  key: 'site.author_name',
  schema: z.string().trim().min(1).max(120),
  defaultValue: 'Diani',
  description: 'Autrice affichée sur les articles (données structurées).',
});

export const LOGO_URL = defineSetting({
  key: 'site.logo_url',
  schema: emptyOr(z.url().max(500)),
  defaultValue: '',
  description: 'Adresse du logo (données structurées). Vide : aucun logo déclaré.',
});

export const CONTACT_EMAIL = defineSetting({
  key: 'site.contact_email',
  schema: emptyOr(z.email().max(254)),
  defaultValue: '',
  description: 'Adresse e-mail de contact affichée sur le site (pied de page, mentions légales).',
});

const socialLinksSchema = z.object({
  instagram: emptyOr(httpsUrl),
  tiktok: emptyOr(httpsUrl),
  facebook: emptyOr(httpsUrl),
  youtube: emptyOr(httpsUrl),
});

export const SOCIAL_LINKS = defineSetting({
  key: 'site.social_links',
  schema: socialLinksSchema,
  defaultValue: { instagram: '', tiktok: '', facebook: '', youtube: '' },
  description: 'Liens vers les réseaux sociaux (adresses https, laisser vide pour masquer).',
});

const announcementSchema = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(200),
  /** Lien facultatif : chemin du site (« /formations », jamais « //autre-site ») ou adresse https. */
  link: emptyOr(z.union([z.string().regex(/^\/(?!\/)[A-Za-z0-9/_-]{0,200}$/), httpsUrl])),
});

export const ANNOUNCEMENT = defineSetting({
  key: 'site.announcement',
  schema: announcementSchema.refine((value) => !value.enabled || value.text.length > 0, {
    message: 'Le texte du bandeau est obligatoire quand il est affiché.',
    path: ['text'],
  }),
  defaultValue: { enabled: false, text: '', link: '' },
  description: 'Bandeau d’annonce en haut du site (promotion, fermeture exceptionnelle…).',
});

/** Interrupteur des ventes de la boutique (vacances, rupture générale). */
export const SHOP_OPEN = defineSetting({
  key: 'features.shop_open',
  schema: z.boolean(),
  defaultValue: true,
  description:
    'Boutique ouverte aux commandes. Fermée : le catalogue reste visible, la validation du panier est refusée.',
});

/** Interrupteur des ventes de packs de formation. */
export const COURSE_SALES_OPEN = defineSetting({
  key: 'features.course_sales_open',
  schema: z.boolean(),
  defaultValue: true,
  description:
    'Achat des packs de formation ouvert. Fermé : les pages restent visibles, les accès existants aussi.',
});
