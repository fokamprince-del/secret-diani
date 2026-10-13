import { z } from 'zod';
import { defineSetting } from '../settings/settings.service';

const cents = z.number().int().min(0).max(10_000_000);

/** Seuil de l'acompte : total strictement inférieur → petit acompte, sinon grand (décision D-041). */
export const DEPOSIT_THRESHOLD = defineSetting({
  key: 'catering.deposit_threshold_cents',
  schema: cents,
  defaultValue: 5_000,
  description: 'Seuil (en centimes) qui sépare les deux montants d’acompte. Par défaut : 50 €.',
});

export const DEPOSIT_BELOW = defineSetting({
  key: 'catering.deposit_below_cents',
  schema: cents,
  defaultValue: 1_000,
  description: 'Acompte (en centimes) pour une commande sous le seuil. Par défaut : 10 €.',
});

export const DEPOSIT_FROM = defineSetting({
  key: 'catering.deposit_from_cents',
  schema: cents,
  defaultValue: 2_000,
  description: 'Acompte (en centimes) à partir du seuil. Par défaut : 20 €.',
});

/** Délai minimal entre la demande et l'événement (en jours). */
export const MIN_NOTICE_DAYS = defineSetting({
  key: 'catering.min_notice_days',
  schema: z.number().int().min(0).max(60),
  defaultValue: 2,
  description: 'Délai minimal (en jours) entre la demande et la date de l’événement.',
});

/**
 * Conditions de commande affichées sur la page Traiteur et dans les e-mails, après la phrase
 * sur l'acompte (générée à partir des montants ci-dessus, pour ne jamais les contredire).
 */
export const CONDITIONS = defineSetting({
  key: 'catering.conditions',
  schema: z.array(z.string().trim().min(3).max(300)).min(1).max(12),
  defaultValue: [
    'La commande n’est validée qu’après réception de l’acompte.',
    'L’acompte n’est pas remboursable en cas d’annulation de votre part.',
    'Le solde est réglé au retrait ou à la livraison.',
  ],
  description: 'Conditions de commande traiteur (une phrase par élément).',
});

export const WHATSAPP_NUMBER = defineSetting({
  key: 'site.whatsapp_number',
  schema: z.string().trim(),
  defaultValue: '',
  description: 'Numéro WhatsApp affiché sur le site (format international, ex. +33600000000).',
});
