import type { ShippingMethod } from '@prisma/client';

export interface PricedLine {
  unitPriceCents: number;
  quantity: number;
  weightGrams: number;
}

export function cartTotals(lines: PricedLine[]): { subtotalCents: number; weightGrams: number } {
  return lines.reduce(
    (totals, line) => ({
      subtotalCents: totals.subtotalCents + line.unitPriceCents * line.quantity,
      weightGrams: totals.weightGrams + line.weightGrams * line.quantity,
    }),
    { subtotalCents: 0, weightGrams: 0 },
  );
}

export interface RateRule {
  id: string;
  name: string;
  method: ShippingMethod;
  countries: string[];
  minWeightGrams: number;
  maxWeightGrams: number | null;
  priceCents: number;
  freeFromCents: number | null;
  delay: string | null;
}

export interface ShippingOption {
  id: string;
  name: string;
  method: ShippingMethod;
  priceCents: number;
  delay: string | null;
  /** Livraison offerte grâce au montant du panier. */
  free: boolean;
}

/**
 * Options de livraison applicables : retrait toujours proposé (s'il existe), livraison selon
 * le pays et la tranche de poids, offerte au-delà du seuil. Triées par prix croissant.
 */
export function shippingOptions(
  rates: RateRule[],
  context: { country: string | null; weightGrams: number; subtotalCents: number },
): ShippingOption[] {
  return rates
    .filter((rate) => {
      if (rate.method === 'pickup') return true;
      if (!context.country || !rate.countries.includes(context.country)) return false;
      return (
        context.weightGrams >= rate.minWeightGrams &&
        (rate.maxWeightGrams === null || context.weightGrams <= rate.maxWeightGrams)
      );
    })
    .map((rate) => {
      const free = rate.freeFromCents !== null && context.subtotalCents >= rate.freeFromCents;
      return {
        id: rate.id,
        name: rate.name,
        method: rate.method,
        priceCents: free ? 0 : rate.priceCents,
        delay: rate.delay,
        free: free && rate.priceCents > 0,
      };
    })
    .sort((a, b) => a.priceCents - b.priceCents);
}
