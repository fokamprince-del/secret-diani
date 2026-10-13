export type AvailabilityStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface Availability {
  status: AvailabilityStatus;
  /** Quantité affichée (« plus que 2 ») sous le seuil d'affichage ; null sinon. */
  remaining: number | null;
}

/** Disponible = en stock − réservé (paiements en cours). */
export function availableQuantity(stock: { onHand: number; reserved: number } | null): number {
  return stock ? Math.max(stock.onHand - stock.reserved, 0) : 0;
}

export function availability(available: number, displayThreshold: number): Availability {
  if (available <= 0) return { status: 'out_of_stock', remaining: 0 };
  if (available <= displayThreshold) return { status: 'low_stock', remaining: available };
  return { status: 'in_stock', remaining: null };
}

/** schema.org/ItemAvailability. */
export function schemaAvailability(status: AvailabilityStatus): string {
  return status === 'out_of_stock'
    ? 'https://schema.org/OutOfStock'
    : status === 'low_stock'
      ? 'https://schema.org/LimitedAvailability'
      : 'https://schema.org/InStock';
}
