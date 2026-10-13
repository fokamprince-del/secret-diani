import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfigService } from '../../config/app-config.service';
import { PAYMENT_FETCH, type PaymentFetch } from '../payments.constants';
import {
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvidence,
  PaymentProviderError,
  type RefundResult,
} from './gateway.types';

/** Tolérance d'horodatage des webhooks (anti-rejeu) : 5 minutes. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface PaidSession {
  sessionId: string;
  paymentId: string | null;
  evidence: PaymentEvidence | null;
}

/**
 * Stripe Checkout : page de paiement hébergée par Stripe (aucune donnée de carte ne transite
 * par nos serveurs, PCI DSS SAQ A). SDK officiel, transport `fetch` injectable (tests),
 * relances réseau du SDK, clés d'idempotence sur toutes les créations.
 */
@Injectable()
export class StripeGateway {
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | undefined;

  constructor(config: AppConfigService, @Inject(PAYMENT_FETCH) fetchImpl: PaymentFetch) {
    const key = config.get('STRIPE_SECRET_KEY');
    this.webhookSecret = config.get('STRIPE_WEBHOOK_SECRET');
    this.client = key
      ? new Stripe(key, {
          httpClient: Stripe.createFetchHttpClient(fetchImpl),
          maxNetworkRetries: 2,
          timeout: 15_000,
          telemetry: false,
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const session = await this.call(() =>
      this.stripe().checkout.sessions.create(
        {
          mode: 'payment',
          locale: 'fr',
          client_reference_id: request.orderId,
          customer_email: request.email,
          line_items: request.lines.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency: 'eur',
              unit_amount: line.unitAmountCents,
              product_data: { name: line.name.slice(0, 250) },
            },
          })),
          metadata: { orderId: request.orderId, paymentId: request.paymentId },
          payment_intent_data: {
            description: `Commande ${request.orderReference}`,
            metadata: { orderId: request.orderId, paymentId: request.paymentId },
          },
          expires_at: Math.floor(request.expiresAt.getTime() / 1000),
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
        },
        { idempotencyKey: `checkout-${request.paymentId}` },
      ),
    );
    if (!session.url) throw new PaymentProviderError('Session Stripe sans URL');
    if (session.amount_total !== request.totalCents) {
      throw new PaymentProviderError('Montant de la session Stripe différent de la commande');
    }
    return { sessionId: session.id, redirectUrl: session.url };
  }

  /** Ferme une session encore ouverte (nouvelle tentative de paiement) ; sans effet sinon. */
  async expireSession(sessionId: string): Promise<void> {
    await this.stripe()
      .checkout.sessions.expire(sessionId)
      .catch(() => undefined);
  }

  async refund(
    paymentIntentId: string,
    amountCents: number,
    refundId: string,
  ): Promise<RefundResult> {
    const refund = await this.call(() =>
      this.stripe().refunds.create(
        { payment_intent: paymentIntentId, amount: amountCents, metadata: { refundId } },
        { idempotencyKey: `refund-${refundId}` },
      ),
    );
    return { providerRefundId: refund.id, status: refundStatus(refund.status) };
  }

  /** Vérifie la signature et l'horodatage (5 min) d'un webhook ; lève une erreur sinon. */
  verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) throw new PaymentProviderError('Stripe non configuré');
    return this.stripe().webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
      WEBHOOK_TOLERANCE_SECONDS,
    );
  }

  /** Sessions payées depuis une date (réconciliation : webhook perdu). */
  async paidSessionsSince(since: Date): Promise<PaidSession[]> {
    const paid: PaidSession[] = [];
    const list = this.stripe().checkout.sessions.list({
      created: { gte: Math.floor(since.getTime() / 1000) },
      status: 'complete',
      limit: 100,
    });
    for await (const session of list) {
      if (session.payment_status === 'paid') paid.push(paidSession(session));
      if (paid.length >= 2_000) break;
    }
    return paid;
  }

  private stripe(): Stripe {
    if (!this.client) throw new PaymentProviderError('Stripe non configuré');
    return this.client;
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      throw new PaymentProviderError(`Stripe : ${(error as Error).message}`);
    }
  }
}

export function refundStatus(status: string | null): RefundResult['status'] {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'pending';
}

/** Session Stripe → preuve de paiement (identifiants, montant, devise). */
export function paidSession(session: Stripe.Checkout.Session): PaidSession {
  const intent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  return {
    sessionId: session.id,
    paymentId: session.metadata?.paymentId ?? null,
    evidence:
      intent && session.amount_total !== null
        ? {
            providerPaymentId: intent,
            amountCents: session.amount_total,
            currency: (session.currency ?? '').toUpperCase(),
          }
        : null,
  };
}
