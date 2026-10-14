const priceFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** Montant en centimes (unité de l'API) → « 29,99 € ». */
export function formatPrice(amountInCents: number): string {
  return priceFormatter.format(amountInCents / 100);
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/** Date ISO (« 2026-09-12 » ou date-heure) → « 12 septembre 2026 ». */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

/** « 1 minute de lecture », « 6 minutes de lecture ». */
export function formatReadingTime(minutes: number): string {
  const value = Math.max(1, Math.round(minutes));
  return `${value} minute${value > 1 ? 's' : ''} de lecture`;
}

/** Accord simple : pluralize(3, 'avis', 'avis'), pluralize(2, 'invité', 'invités'). */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${Math.abs(count) > 1 ? plural : singular}`;
}

/** Durée en minutes → « 45 min », « 1 h », « 1 h 20 min ». */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
