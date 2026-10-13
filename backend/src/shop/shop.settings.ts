import { z } from 'zod';
import { defineSetting } from '../settings/settings.service';

/** Durée de réservation du stock pendant le paiement (cahier des charges : 15 minutes). */
export const RESERVATION_MINUTES = defineSetting({
  key: 'shop.reservation_minutes',
  schema: z.number().int().min(5).max(120),
  defaultValue: 15,
  description: 'Durée (minutes) pendant laquelle le stock est réservé pour une commande à payer.',
});

/** Quantité maximale d'une même variante dans un panier (anti-accaparement du stock). */
export const MAX_QUANTITY_PER_ITEM = defineSetting({
  key: 'shop.max_quantity_per_item',
  schema: z.number().int().min(1).max(99),
  defaultValue: 10,
  description: 'Quantité maximale d’un même article par commande.',
});

/** En dessous de ce disponible, la fiche affiche « plus que N ». */
export const LOW_STOCK_DISPLAY = defineSetting({
  key: 'shop.low_stock_display',
  schema: z.number().int().min(0).max(100),
  defaultValue: 5,
  description: 'Seuil d’affichage « plus que N en stock » sur le site.',
});

export const PICKUP_DETAILS = defineSetting({
  key: 'shop.pickup_details',
  schema: z.string().trim().max(500),
  defaultValue: '',
  description: 'Adresse et horaires du retrait, affichés au panier et dans les e-mails.',
});

const sellerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  legalForm: z.string().trim().max(120),
  address: z.string().trim().max(300),
  siret: z.string().trim().max(20),
  email: z.string().trim().max(254),
  vatMention: z.string().trim().min(1).max(200),
});

export type Seller = z.infer<typeof sellerSchema>;

/**
 * Mentions légales du vendeur reprises sur chaque facture (figées à l'émission). Valeurs à
 * compléter avant la mise en production (RUNBOOK) ; la franchise de TVA est l'hypothèse par
 * défaut (micro-entreprise), à confirmer par Diani.
 */
export const SELLER = defineSetting({
  key: 'legal.seller',
  schema: sellerSchema,
  defaultValue: {
    name: 'Les Secrets de Diani',
    legalForm: '',
    address: '',
    siret: '',
    email: '',
    vatMention: 'TVA non applicable, art. 293 B du CGI',
  },
  description:
    'Vendeur affiché sur les factures : nom, forme, adresse, SIRET, e-mail, mention TVA.',
});
