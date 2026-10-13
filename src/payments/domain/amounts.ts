/**
 * Conversions centimes ↔ montant décimal des API de paiement (« 83.88 »), sans flottant :
 * un montant mal formé est refusé plutôt qu'arrondi.
 */
export function centsToDecimal(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new RangeError('Montant en centimes invalide');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function decimalToCents(value: string): number {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new RangeError(`Montant décimal invalide : ${value}`);
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}
