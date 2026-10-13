const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Jour courant à Paris, au format AAAA-MM-JJ. */
export function parisToday(now: Date): string {
  return PARIS_DAY.format(now);
}

/** « 2026-11-14 » + 3 jours → « 2026-11-17 ». */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Une date AAAA-MM-JJ qui existe réellement (refuse le 31 février). */
export function isRealDate(isoDate: string): boolean {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === isoDate;
}

/**
 * Fenêtre acceptée pour la date d'un événement : au plus tôt dans `minNoticeDays` jours
 * (heure de Paris), au plus tard dans un an.
 */
export function eventDateWindow(now: Date, minNoticeDays: number): { min: string; max: string } {
  const today = parisToday(now);
  return { min: addDays(today, minNoticeDays), max: addDays(today, 366) };
}
