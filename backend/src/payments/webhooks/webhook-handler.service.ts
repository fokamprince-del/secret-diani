import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { decimalToCents } from '../domain/amounts';
import { captureEvidence } from '../gateways/paypal.gateway';
import { paidSession, refundStatus } from '../gateways/stripe.gateway';
import { PaymentsService } from '../payments.service';
import { RefundsService } from '../refunds.service';

type Handled = 'processed' | 'ignored';

interface PayPalEvent {
  event_type: string;
  resource: Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Traitement asynchrone (worker) d'un événement de paiement déjà vérifié et enregistré.
 * Idempotent de bout en bout : un événement retraité ne produit aucun second effet.
 */
@Injectable()
export class WebhookHandlerService {
  private readonly logger = new Logger(WebhookHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  async process(webhookEventId: string): Promise<void> {
    const event = await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { attempts: { increment: 1 } },
      select: { provider: true, type: true, payload: true, status: true },
    });
    if (event.status === 'processed' || event.status === 'ignored') return;
    try {
      const result =
        event.provider === 'stripe'
          ? await this.stripe(event.payload as unknown as Stripe.Event)
          : await this.paypal(event.payload as unknown as PayPalEvent);
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: result, processedAt: new Date(), error: null },
      });
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'failed', error: (error as Error).message.slice(0, 500) },
      });
      this.logger.error(
        { err: error, type: event.type },
        'Traitement d’un webhook en échec (relancé)',
      );
      throw error;
    }
  }

  private async stripe(event: Stripe.Event): Promise<Handled> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status !== 'paid') return 'ignored';
        const paid = paidSession(session);
        const paymentId = paid.paymentId ?? (await this.paymentBySession(paid.sessionId));
        if (!paymentId || !paid.evidence) return 'ignored';
        await this.payments.confirm(paymentId, paid.evidence);
        return 'processed';
      }
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const paymentId = await this.paymentBySession(event.data.object.id);
        if (!paymentId) return 'ignored';
        if (event.type === 'checkout.session.expired') await this.payments.abandon(paymentId);
        else await this.payments.fail(paymentId, 'Paiement refusé');
        return 'processed';
      }
      case 'refund.updated':
      case 'charge.refund.updated': {
        const refund = event.data.object;
        return (await this.refunds.syncProviderStatus(refund.id, refundStatus(refund.status)))
          ? 'processed'
          : 'ignored';
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        const intent = str(
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id,
        );
        const refund = charge.refunds?.data?.[0];
        if (!intent || !refund) return 'ignored';
        // Un remboursement lancé par l'API est déjà connu : il est seulement synchronisé.
        if (await this.refunds.syncProviderStatus(refund.id, refundStatus(refund.status)))
          return 'processed';
        if (refundStatus(refund.status) !== 'succeeded') return 'ignored';
        return (await this.refunds.recordExternalRefund('stripe', intent, refund.id, refund.amount))
          ? 'processed'
          : 'ignored';
      }
      case 'charge.dispute.created': {
        const dispute = event.data.object;
        const intent = str(
          typeof dispute.payment_intent === 'string'
            ? dispute.payment_intent
            : dispute.payment_intent?.id,
        );
        if (!intent) return 'ignored';
        return (await this.payments.dispute('stripe', intent, dispute.reason))
          ? 'processed'
          : 'ignored';
      }
      default:
        return 'ignored';
    }
  }

  private async paypal(event: PayPalEvent): Promise<Handled> {
    const resource = event.resource ?? {};
    switch (event.event_type) {
      case 'CHECKOUT.ORDER.APPROVED': {
        // Validation par la cliente sans retour sur le site (onglet fermé) : capture côté serveur.
        const orderId = str(resource.id);
        const payment = orderId
          ? await this.prisma.payment.findUnique({
              where: { providerSessionId: orderId },
              select: { id: true, status: true, order: { select: { status: true } } },
            })
          : null;
        if (!payment || payment.status !== 'pending') return 'ignored';
        if (payment.order.status !== 'pending_payment') return 'ignored';
        await this.payments.captureAndConfirm(payment.id, orderId!);
        return 'processed';
      }
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const paymentId = str(resource.custom_id);
        const evidence = captureEvidence(
          resource as unknown as Parameters<typeof captureEvidence>[0],
        );
        if (!paymentId || !evidence) return 'ignored';
        await this.payments.confirm(paymentId, evidence);
        return 'processed';
      }
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED': {
        const paymentId = str(resource.custom_id);
        if (!paymentId) return 'ignored';
        await this.payments.fail(paymentId, 'Paiement refusé par PayPal');
        return 'processed';
      }
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        const refundId = str(resource.id);
        if (!refundId) return 'ignored';
        if (await this.refunds.syncProviderStatus(refundId, 'succeeded')) return 'processed';
        const captureId = this.captureIdFromLinks(resource.links);
        const amount = (resource.amount as { value?: string } | undefined)?.value;
        if (!captureId || !amount) return 'ignored';
        return (await this.refunds.recordExternalRefund(
          'paypal',
          captureId,
          refundId,
          decimalToCents(amount),
        ))
          ? 'processed'
          : 'ignored';
      }
      case 'CUSTOMER.DISPUTE.CREATED': {
        const transactions = resource.disputed_transactions as
          { seller_transaction_id?: string }[] | undefined;
        const captureId = str(transactions?.[0]?.seller_transaction_id);
        if (!captureId) return 'ignored';
        return (await this.payments.dispute(
          'paypal',
          captureId,
          str(resource.reason) ?? 'non précisé',
        ))
          ? 'processed'
          : 'ignored';
      }
      default:
        return 'ignored';
    }
  }

  private async paymentBySession(sessionId: string): Promise<string | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerSessionId: sessionId },
      select: { id: true },
    });
    return payment?.id ?? null;
  }

  /** Remboursement PayPal : la capture d'origine est dans le lien « up ». */
  private captureIdFromLinks(links: unknown): string | null {
    if (!Array.isArray(links)) return null;
    const up = (links as { rel?: string; href?: string }[]).find((link) => link.rel === 'up');
    const match = up?.href ? /\/captures\/([A-Za-z0-9-]+)$/.exec(up.href) : null;
    return match?.[1] ?? null;
  }
}
