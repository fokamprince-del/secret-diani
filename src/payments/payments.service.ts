import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { PaymentProvider } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { formatEuros } from '../common/utils/money';
import { AppConfigService } from '../config/app-config.service';
import { notFound } from '../content/common/content.helpers';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { orderReference } from '../shop/domain/order-status';
import { OrderLinkService } from '../shop/orders/order-link.service';
import { OrdersService } from '../shop/orders/orders.service';
import type { CheckoutLine, PaymentEvidence } from './gateways/gateway.types';
import { PaymentProviderError } from './gateways/gateway.types';
import { captureEvidence, PayPalGateway } from './gateways/paypal.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { CHECKOUT_SESSION_MINUTES, RESERVATION_MARGIN_MINUTES } from './payments.constants';
import { RefundsService } from './refunds.service';

export interface StartedPayment {
  paymentId: string;
  provider: PaymentProvider;
  redirectUrl: string;
  expiresAt: Date;
}

export type ConfirmOutcome =
  | 'paid'
  | 'already_processed'
  | 'unknown_payment'
  | 'amount_mismatch'
  | 'refunded_stock_unavailable'
  | 'refunded_duplicate';

function unavailable(): AppException {
  return new AppException(
    HttpStatus.SERVICE_UNAVAILABLE,
    ErrorCode.PAYMENT_METHOD_UNAVAILABLE,
    'Ce moyen de paiement n’est pas disponible pour le moment.',
  );
}

function providerError(): AppException {
  return new AppException(
    HttpStatus.BAD_GATEWAY,
    ErrorCode.PAYMENT_PROVIDER_ERROR,
    'Le paiement est momentanément indisponible. Merci de réessayer dans quelques instants.',
  );
}

/**
 * Paiements : ouverture de la page hébergée (Stripe Checkout ou PayPal), confirmation à partir
 * d'une preuve du prestataire (webhook signé, capture PayPal faite par le serveur ou
 * réconciliation), échecs, abandons et litiges. Une commande n'est validée qu'après un
 * événement confirmé, avec le montant attendu.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    private readonly paypal: PayPalGateway,
    private readonly orders: OrdersService,
    private readonly refunds: RefundsService,
    private readonly links: OrderLinkService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: AppConfigService,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL').replace(/\/$/, '');
  }

  methods(): { stripe: boolean; paypal: boolean } {
    return { stripe: this.stripe.enabled, paypal: this.paypal.enabled };
  }

  /**
   * Ouvre une page de paiement pour une commande en attente (accès par le lien signé reçu à la
   * validation du panier). La réservation du stock est prolongée jusqu'à l'expiration de la
   * page : un paiement réussi trouve toujours son stock.
   */
  async start(orderToken: string, provider: PaymentProvider): Promise<StartedPayment> {
    const gateway = provider === 'stripe' ? this.stripe : this.paypal;
    if (!gateway.enabled) throw unavailable();
    const orderId = this.links.verify(orderToken);
    const order = orderId
      ? await this.prisma.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            number: true,
            status: true,
            email: true,
            totalCents: true,
            shippingCents: true,
            shippingRateName: true,
            reservationExpiresAt: true,
            items: {
              orderBy: { position: 'asc' },
              select: {
                productName: true,
                variantLabel: true,
                quantity: true,
                unitPriceCents: true,
              },
            },
          },
        })
      : null;
    if (!order) throw notFound('Commande introuvable.');
    const now = new Date();
    if (
      order.status !== 'pending_payment' ||
      !order.reservationExpiresAt ||
      order.reservationExpiresAt <= now
    ) {
      throw order.status === 'pending_payment' || order.status === 'cancelled'
        ? new AppException(
            HttpStatus.CONFLICT,
            ErrorCode.PAYMENT_EXPIRED,
            'Le délai de paiement est dépassé : validez à nouveau votre panier.',
          )
        : new AppException(
            HttpStatus.CONFLICT,
            ErrorCode.ALREADY_PAID,
            'Cette commande est déjà payée.',
          );
    }

    // Une page encore valide pour ce moyen de paiement est réutilisée (double clic, retour arrière).
    const reusable = await this.prisma.payment.findFirst({
      where: {
        orderId: order.id,
        provider,
        status: 'pending',
        redirectUrl: { not: null },
        expiresAt: { gt: new Date(now.getTime() + 5 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, redirectUrl: true, expiresAt: true },
    });
    if (reusable?.redirectUrl) {
      return {
        paymentId: reusable.id,
        provider,
        redirectUrl: reusable.redirectUrl,
        expiresAt: reusable.expiresAt,
      };
    }

    const expiresAt = new Date(now.getTime() + (CHECKOUT_SESSION_MINUTES + 1) * 60_000);
    const reservedUntil = new Date(expiresAt.getTime() + RESERVATION_MARGIN_MINUTES * 60_000);
    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: { orderId: order.id, provider, amountCents: order.totalCents, expiresAt },
        select: { id: true },
      });
      if (reservedUntil > order.reservationExpiresAt!) {
        await tx.order.updateMany({
          where: { id: order.id, status: 'pending_payment' },
          data: { reservationExpiresAt: reservedUntil },
        });
        await tx.stockReservation.updateMany({
          where: { orderId: order.id, consumedAt: null, releasedAt: null },
          data: { expiresAt: reservedUntil },
        });
      }
      return created;
    });

    const lines: CheckoutLine[] = order.items.map((item) => ({
      name: `${item.productName} (${item.variantLabel})`,
      quantity: item.quantity,
      unitAmountCents: item.unitPriceCents,
    }));
    if (order.shippingCents > 0) {
      lines.push({
        name: `Livraison : ${order.shippingRateName}`,
        quantity: 1,
        unitAmountCents: order.shippingCents,
      });
    }
    const token = encodeURIComponent(orderToken);
    try {
      const session = await gateway.createCheckout({
        paymentId: payment.id,
        orderId: order.id,
        orderReference: orderReference(order.number),
        email: order.email,
        lines,
        totalCents: order.totalCents,
        // « suivi » et non « token » : PayPal ajoute son propre paramètre « token » au retour.
        successUrl: `${this.siteUrl}/commande/succes?suivi=${token}&moyen=${provider}`,
        cancelUrl: `${this.siteUrl}/commande/annule?suivi=${token}`,
        expiresAt,
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { providerSessionId: session.sessionId, redirectUrl: session.redirectUrl },
      });
      await this.audit.log({
        action: AuditAction.PAYMENT_STARTED,
        targetType: 'order',
        targetId: order.id,
        metadata: { provider },
      });
      return { paymentId: payment.id, provider, redirectUrl: session.redirectUrl, expiresAt };
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', failureReason: (error as Error).message.slice(0, 300) },
      });
      this.logger.error({ err: error }, `Ouverture du paiement ${provider} impossible`);
      throw providerError();
    }
  }

  /**
   * Retour de la page PayPal : le serveur capture lui-même le paiement validé par la cliente
   * (appel serveur à serveur), puis le confirme. Idempotent.
   */
  async capturePayPal(orderToken: string): Promise<ConfirmOutcome> {
    if (!this.paypal.enabled) throw unavailable();
    const orderId = this.links.verify(orderToken);
    if (!orderId) throw notFound('Commande introuvable.');
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, provider: 'paypal', providerSessionId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, providerSessionId: true },
    });
    if (!payment) throw notFound('Aucun paiement PayPal pour cette commande.');
    if (payment.status !== 'pending') return 'already_processed';
    return this.captureAndConfirm(payment.id, payment.providerSessionId!);
  }

  /** Capture une commande PayPal validée puis confirme le paiement (retour ou webhook). */
  async captureAndConfirm(paymentId: string, paypalOrderId: string): Promise<ConfirmOutcome> {
    let evidence: PaymentEvidence | null;
    try {
      evidence = captureEvidence((await this.paypal.capture(paypalOrderId, paymentId)).capture);
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        await this.fail(paymentId, 'Paiement refusé par PayPal');
        throw new AppException(
          HttpStatus.PAYMENT_REQUIRED,
          ErrorCode.PAYMENT_FAILED,
          'Le paiement a été refusé. Vous pouvez réessayer ou choisir un autre moyen de paiement.',
        );
      }
      throw error;
    }
    if (!evidence) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.PAYMENT_FAILED,
        'Le paiement PayPal n’a pas été validé. Vous pouvez réessayer.',
      );
    }
    return this.confirm(paymentId, evidence);
  }

  /**
   * Confirmation d'un paiement à partir d'une preuve du prestataire. Idempotente ; refuse un
   * montant ou une devise inattendus ; rembourse automatiquement un paiement qui ne peut plus
   * être honoré (stock épuisé après expiration) ou qui fait double emploi.
   */
  async confirm(paymentId: string, evidence: PaymentEvidence): Promise<ConfirmOutcome> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, orderId: true, provider: true, status: true, amountCents: true },
    });
    if (!payment) return 'unknown_payment';
    if (!['pending', 'abandoned', 'failed'].includes(payment.status)) return 'already_processed';

    if (evidence.amountCents !== payment.amountCents || evidence.currency.toUpperCase() !== 'EUR') {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'failed', failureReason: 'Montant reçu différent du montant attendu' },
      });
      await this.audit.log({
        action: AuditAction.PAYMENT_AMOUNT_MISMATCH,
        targetType: 'payment',
        targetId: paymentId,
        metadata: { expectedCents: payment.amountCents, receivedCents: evidence.amountCents },
      });
      await this.alert('montant incohérent', [
        `Paiement ${payment.provider} ${evidence.providerPaymentId} : ${formatEuros(evidence.amountCents)} ${evidence.currency} reçus pour ${formatEuros(payment.amountCents)} attendus.`,
        'La commande n’a pas été validée. Vérifiez le paiement chez le prestataire et remboursez-le si besoin.',
      ]);
      return 'amount_mismatch';
    }

    const claimed = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { in: ['pending', 'abandoned', 'failed'] } },
      data: {
        status: 'succeeded',
        succeededAt: new Date(),
        providerPaymentId: evidence.providerPaymentId,
        failureReason: null,
      },
    });
    if (claimed.count === 0) return 'already_processed';
    await this.audit.log({
      action: AuditAction.PAYMENT_SUCCEEDED,
      targetType: 'order',
      targetId: payment.orderId,
      metadata: { provider: payment.provider, amountCents: evidence.amountCents },
    });

    const outcome = await this.orders.markPaid(payment.orderId, {
      provider: payment.provider,
      reference: evidence.providerPaymentId,
    });
    if (outcome === 'paid') {
      await this.closeOtherSessions(payment.orderId, paymentId);
      return 'paid';
    }
    if (outcome === 'stock_unavailable' || outcome === 'not_payable') {
      await this.refunds.refundAutomatically(
        paymentId,
        'Un article est épuisé : il n’a pas pu vous être réservé au-delà du délai de paiement',
      );
      return 'refunded_stock_unavailable';
    }
    // La commande était déjà payée par un autre paiement : celui-ci fait double emploi.
    await this.refunds.refundAutomatically(paymentId, 'Paiement en double pour la même commande');
    return 'refunded_duplicate';
  }

  async fail(paymentId: string, reason: string): Promise<void> {
    const updated = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'pending' },
      data: { status: 'failed', failureReason: reason },
    });
    if (updated.count > 0) {
      await this.audit.log({
        action: AuditAction.PAYMENT_FAILED,
        targetType: 'payment',
        targetId: paymentId,
      });
    }
  }

  /** Page de paiement expirée ou abandonnée : la commande reste réservée jusqu'à son échéance. */
  async abandon(paymentId: string): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'pending' },
      data: { status: 'abandoned' },
    });
  }

  /** Litige ouvert par la banque de la cliente : paiement signalé, administration alertée. */
  async dispute(
    provider: PaymentProvider,
    providerPaymentId: string,
    details: string,
  ): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerPaymentId },
      select: {
        id: true,
        provider: true,
        orderId: true,
        amountCents: true,
        order: { select: { number: true } },
      },
    });
    if (!payment || payment.provider !== provider) return false;
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'disputed' } });
    await this.audit.log({
      action: AuditAction.PAYMENT_DISPUTED,
      targetType: 'order',
      targetId: payment.orderId,
      metadata: { provider },
    });
    await this.alert('litige ouvert', [
      `Commande ${orderReference(payment.order.number)} : litige sur ${formatEuros(payment.amountCents)} (${provider}).`,
      `Motif communiqué : ${details}.`,
      'Répondez au litige depuis le tableau de bord du prestataire, dans le délai qu’il indique.',
    ]);
    return true;
  }

  /** Paiement confirmé : les autres pages de paiement ouvertes pour la commande sont fermées. */
  private async closeOtherSessions(orderId: string, paidId: string): Promise<void> {
    const others = await this.prisma.payment.findMany({
      where: { orderId, id: { not: paidId }, status: 'pending' },
      select: { id: true, provider: true, providerSessionId: true },
    });
    for (const other of others) {
      if (other.provider === 'stripe' && other.providerSessionId) {
        await this.stripe.expireSession(other.providerSessionId);
      }
      await this.abandon(other.id);
    }
  }

  private async alert(title: string, lines: string[]): Promise<void> {
    await this.mail.sendToAdmins('payment-alert', { title, lines }).catch((error: unknown) => {
      this.logger.error({ err: error }, 'Alerte de paiement non envoyée');
    });
  }
}
