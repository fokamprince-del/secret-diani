import type { CateringRequestStatus } from '@prisma/client';

/**
 * Cycle de vie d'une demande traiteur :
 *   nouvelle → contactée → acompte reçu → confirmée → livrée
 * et annulation possible jusqu'à la livraison. Une commande n'est confirmée qu'après
 * réception de l'acompte (règle métier, aussi garantie par une contrainte CHECK en base).
 * « acompte reçu » s'atteint uniquement par l'enregistrement de l'acompte (montant calculé).
 */
const TRANSITIONS: Record<CateringRequestStatus, readonly CateringRequestStatus[]> = {
  new: ['contacted', 'deposit_received', 'cancelled'],
  contacted: ['deposit_received', 'cancelled'],
  deposit_received: ['confirmed', 'cancelled'],
  confirmed: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: CateringRequestStatus, to: CateringRequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: CateringRequestStatus): readonly CateringRequestStatus[] {
  return TRANSITIONS[from];
}

export function isFinal(status: CateringRequestStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Libellés français (e-mails, récapitulatif, historique). */
export const STATUS_LABELS: Record<CateringRequestStatus, string> = {
  new: 'Nouvelle',
  contacted: 'Contactée',
  deposit_received: 'Acompte reçu',
  confirmed: 'Confirmée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

/** Numéro lisible d'une demande : 42 → « TR-000042 ». */
export function requestReference(number: number): string {
  return `TR-${String(number).padStart(6, '0')}`;
}

/** « TR-000042 », « tr-42 » ou « 42 » → 42 ; null si ce n'est pas une référence. */
export function parseReference(input: string): number | null {
  const match = /^(?:tr-?)?0*(\d{1,9})$/i.exec(input.trim());
  return match ? Number(match[1]) : null;
}
