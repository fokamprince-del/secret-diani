import type { CateringConditions } from './api/types';
import { formatPrice } from './format';

/** Un élément de la demande traiteur en préparation (côté navigateur, sans prix envoyé). */
export interface SelectionItem {
  /** Clé unique : variante + parfums (le même gâteau avec d'autres parfums est un autre élément). */
  key: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  /** Prix indicatif affiché ; le serveur recalcule toujours le total. */
  priceCents: number;
  flavourIds: string[];
  flavourNames: string[];
  quantity: number;
}

export function selectionKey(variantId: string, flavourIds: string[]): string {
  return [variantId, ...[...flavourIds].sort()].join(':');
}

/** « Layer cake (6–8 parts), parfums : vanille et fraise » */
export function describeChoice(
  productName: string,
  variantLabel: string | undefined,
  flavourNames: string[],
): string {
  const base = variantLabel ? `${productName} (${variantLabel})` : productName;
  if (flavourNames.length === 0) return base;
  const names = flavourNames.map((name) => name.toLowerCase());
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;
  return `${base}, parfum${names.length > 1 ? 's' : ''} : ${list}`;
}

/**
 * Lien WhatsApp de l'API (numéro configuré dans l'administration), avec le message adapté
 * au choix du visiteur. `null` si aucun numéro n'est configuré.
 */
export function whatsappWithMessage(baseUrl: string | null, message: string): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me') return null;
    url.searchParams.set('text', message);
    return url.toString();
  } catch {
    return null;
  }
}

export function orderMessage(choice: string): string {
  return `Bonjour Diani, je souhaite commander : ${choice}. Pouvez-vous me donner vos disponibilités ?`;
}

export function selectionTotal(items: SelectionItem[]): number {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

/** Acompte selon la règle de l'API (sous le seuil : petit acompte ; sinon : grand). */
export function depositFor(totalCents: number, rule: CateringConditions['deposit']): number {
  return totalCents < rule.thresholdCents ? rule.belowCents : rule.fromCents;
}

export function depositHint(totalCents: number, rule: CateringConditions['deposit']): string {
  return `Acompte à prévoir : ${formatPrice(depositFor(totalCents, rule))}, réglé après confirmation par Diani.`;
}

/** Date au format AAAA-MM-JJ, en heure de Paris, `days` jours après aujourd'hui. */
export function isoDateIn(days: number, from = new Date()): string {
  const date = new Date(from.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
