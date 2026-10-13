import type { OrderStatus } from '@prisma/client';

/**
 * Cycle de vie d'une commande boutique :
 *   en attente de paiement → payée → en préparation → expédiée → livrée
 * « payée » n'est posé que par la confirmation du paiement (webhook, phase 6) et « remboursée »
 * que par un remboursement : l'administration ne choisit que les étapes logistiques.
 * Une commande non payée s'annule ; une commande payée se rembourse (phase 6).
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['preparing', 'shipped', 'refunded'],
  preparing: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

/** Étapes que l'administration peut poser elle-même. */
export const ADMIN_STATUSES = ['preparing', 'shipped', 'delivered', 'cancelled'] as const;
export type AdminOrderStatus = (typeof ADMIN_STATUSES)[number];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextAdminStatuses(from: OrderStatus): AdminOrderStatus[] {
  return ADMIN_STATUSES.filter((status) => TRANSITIONS[from].includes(status));
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'En attente de paiement',
  paid: 'Payée',
  preparing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

/** 42 → « CMD-000042 ». */
export function orderReference(number: number): string {
  return `CMD-${String(number).padStart(6, '0')}`;
}

/** « CMD-000042 », « cmd42 » ou « 42 » → 42 ; null sinon. */
export function parseOrderReference(input: string): number | null {
  const match = /^(?:cmd-?)?0*(\d{1,9})$/i.exec(input.trim());
  return match ? Number(match[1]) : null;
}

/** 2026, 1 → « F-2026-00001 ». */
export function invoiceNumber(year: number, sequence: number): string {
  return `F-${year}-${String(sequence).padStart(5, '0')}`;
}
