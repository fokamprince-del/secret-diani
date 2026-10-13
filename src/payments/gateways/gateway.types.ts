/** Ligne transmise à la page de paiement hébergée (montants fixés par le serveur). */
export interface CheckoutLine {
  name: string;
  quantity: number;
  unitAmountCents: number;
}

export interface CheckoutRequest {
  paymentId: string;
  orderId: string;
  orderReference: string;
  email: string;
  lines: CheckoutLine[];
  totalCents: number;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

export interface CheckoutSession {
  sessionId: string;
  redirectUrl: string;
}

/** Preuve de paiement renvoyée par le prestataire (vérifiée avant de valider la commande). */
export interface PaymentEvidence {
  providerPaymentId: string;
  amountCents: number;
  currency: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'succeeded' | 'pending' | 'failed';
}

/** Erreur d'un prestataire de paiement (message technique, jamais montré tel quel). */
export class PaymentProviderError extends Error {}
