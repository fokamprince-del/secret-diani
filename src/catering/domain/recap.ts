import type { CateringFulfilment, CateringRequestStatus } from '@prisma/client';
import { formatEuros, formatLongDate } from '../../common/utils/money';
import { requestReference, STATUS_LABELS } from './request-status';

export interface RecapInput {
  number: number;
  status: CateringRequestStatus;
  firstName: string;
  lastName: string | null;
  eventDate: Date;
  guestCount: number | null;
  fulfilment: CateringFulfilment | null;
  deliveryAddress: string | null;
  estimatedTotalCents: number | null;
  agreedTotalCents: number | null;
  depositCents: number | null;
  depositReceivedAt: Date | null;
  items: {
    productName: string;
    variantLabel: string;
    quantity: number;
    unitPriceCents: number;
    flavours: string[];
  }[];
}

const FULFILMENT_LABELS: Record<CateringFulfilment, string> = {
  pickup: 'Retrait',
  delivery: 'Livraison',
};

/**
 * Récapitulatif texte d'une demande, prêt à être copié dans WhatsApp ou un e-mail :
 * sélection, total, acompte, solde et conditions. Aucune note interne.
 */
export function buildRecap(input: RecapInput, conditions: string[]): string {
  const lines: string[] = [
    `Commande ${requestReference(input.number)} — ${STATUS_LABELS[input.status]}`,
    `Cliente : ${[input.firstName, input.lastName].filter(Boolean).join(' ')}`,
    `Date : ${formatLongDate(input.eventDate)}`,
  ];
  if (input.guestCount) lines.push(`Invités : ${input.guestCount}`);
  if (input.fulfilment) {
    const where = input.fulfilment === 'delivery' && input.deliveryAddress;
    lines.push(
      `${FULFILMENT_LABELS[input.fulfilment]}${where ? ` : ${input.deliveryAddress}` : ''}`,
    );
  }

  if (input.items.length > 0) {
    lines.push('', 'Sélection :');
    for (const item of input.items) {
      const flavours = item.flavours.length > 0 ? ` — parfums : ${item.flavours.join(', ')}` : '';
      lines.push(
        `- ${item.quantity} × ${item.productName} (${item.variantLabel}) : ${formatEuros(item.unitPriceCents * item.quantity)}${flavours}`,
      );
    }
  }

  const total = input.agreedTotalCents ?? input.estimatedTotalCents;
  if (total !== null) {
    lines.push(
      '',
      `${input.agreedTotalCents !== null ? 'Total' : 'Total estimé'} : ${formatEuros(total)}`,
    );
  }
  if (input.depositCents !== null && input.agreedTotalCents !== null) {
    const received = input.depositReceivedAt ? ' (reçu)' : ' (à régler pour valider la commande)';
    lines.push(`Acompte : ${formatEuros(input.depositCents)}${received}`);
    lines.push(
      `Solde au retrait ou à la livraison : ${formatEuros(input.agreedTotalCents - input.depositCents)}`,
    );
  }

  if (conditions.length > 0) {
    lines.push('', 'Conditions :', ...conditions.map((condition) => `- ${condition}`));
  }
  return lines.join('\n');
}
