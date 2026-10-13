/** Implémentation de `fetch` utilisée pour appeler Stripe et PayPal (remplaçable dans les tests). */
export const PAYMENT_FETCH = Symbol('PAYMENT_FETCH');
export type PaymentFetch = typeof fetch;

/** File du worker : traitement des webhooks et réconciliation quotidienne. */
export const PAYMENTS_QUEUE = 'payments';
export const WEBHOOK_JOB = 'webhook';
export const RECONCILE_JOB = 'reconcile';

export interface WebhookJobData {
  webhookEventId: string;
}

/** Durée de validité d'une page de paiement (minimum imposé par Stripe : 30 minutes). */
export const CHECKOUT_SESSION_MINUTES = 30;
/** Marge ajoutée à la réservation du stock au-delà de l'expiration de la page de paiement. */
export const RESERVATION_MARGIN_MINUTES = 5;
