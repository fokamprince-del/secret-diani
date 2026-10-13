const EURO = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 4000 → « 40,00 € » (montants stockés en centimes, jamais en flottant). */
export function formatEuros(cents: number): string {
  // Espaces insécables d'Intl remplacées par des espaces simples : lisibles dans tous les e-mails.
  return EURO.format(cents / 100).replace(/\p{Zs}/gu, ' ');
}

/** 4000 → « 40.00 » (schema.org Offer.price, séparateur décimal point). */
export function toDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 2026-10-24 (date seule) → « samedi 24 octobre 2026 ». */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
