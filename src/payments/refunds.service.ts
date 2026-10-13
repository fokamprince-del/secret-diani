import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { PaymentProvider, PaymentStatus } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { formatEuros } from '../common/utils/money';
import { fieldError, notFound } from '../content/common/content.helpers';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { canTransition, orderReference } from '../shop/domain/order-status';
import { OrdersService } from '../shop/orders/orders.service';
import { StockLedger } from '../shop/stock/stock-ledger';
import { PaymentProviderError, type RefundResult } from './gateways/gateway.types';
import { PayPalGateway } from './gateways/paypal.gateway';
import { StripeGateway } from './gateways/stripe.gateway';

const REFUNDABLE: PaymentStatus[] = ['succeeded', 'partially_refunded', 'disputed'];

export interface RefundRequest {
  amountCents?: number;
  reason: string;
  restock: boolean;
}

/**
 * Remboursements, total ou partiel, depuis l'administration ou automatiques (stock épuisé
 * pendant le paiement, paiement en double). Le montant est contrôlé sous verrou (jamais plus
 * que le payé moins le déjà remboursé ou en cours), l'appel au prestataire porte une clé
 * d'idempotence, et la finalisation est idempotente (webhook et réponse directe peuvent arriver
 * tous les deux).
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    private readonly paypal: PayPalGateway,
    private readonly orders: OrdersService,
    private readonly ledger: StockLedger,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /** Remboursement décidé par l'administration, sur le paiement réussi de la commande. */
  async refundOrder(orderId: string, request: RefundRequest, actorId: string): Promise<string> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: { in: REFUNDABLE } },
      orderBy: { succeededAt: 'asc' },
      select: { id: true },
    });
    if (!payment) {
      const exists = await this.prisma.order.count({ where: { id: orderId } });
      if (exists === 0) throw notFound('Commande introuvable.');
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Aucun paiement remboursable pour cette commande.',
      );
    }
    return this.execute(payment.id, request, actorId);
  }

  /** Remboursement intégral automatique (aucune action humaine), avec e-mail à la cliente. */
  async refundAutomatically(paymentId: string, reason: string): Promise<void> {
    try {
      await this.execute(paymentId, { reason, restock: false }, null);
    } catch (error) {
      this.logger.error(
        { err: error },
        `Remboursement automatique impossible (paiement ${paymentId})`,
      );
      await this.mail.sendToAdmins('payment-alert', {
        title: 'remboursement automatique en échec',
        lines: [
          `Le paiement ${paymentId} doit être remboursé (${reason}), mais le prestataire a refusé l’opération.`,
          'Effectuez le remboursement depuis l’administration ou le tableau de bord du prestataire.',
        ],
      });
    }
  }

  /** Statut d'un remboursement communiqué par le prestataire (webhook). */
  async syncProviderStatus(
    providerRefundId: string,
    status: RefundResult['status'],
  ): Promise<boolean> {
    const refund = await this.prisma.refund.findUnique({
      where: { providerRefundId },
      select: { id: true, status: true },
    });
    if (!refund) return false;
    if (status === 'succeeded') await this.finalize(refund.id);
    if (status === 'failed' && refund.status === 'pending') {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'failed', failureReason: 'Refusé par le prestataire' },
      });
    }
    return true;
  }

  /**
   * Remboursement fait directement chez le prestataire (tableau de bord) : enregistré pour que
   * la commande, la comptabilité et l'export restent justes.
   */
  async recordExternalRefund(
    provider: PaymentProvider,
    providerPaymentId: string,
    providerRefundId: string,
    amountCents: number,
  ): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerPaymentId },
      select: { id: true, orderId: true, provider: true },
    });
    if (!payment || payment.provider !== provider) return false;
    const existing = await this.prisma.refund.findUnique({
      where: { providerRefundId },
      select: { id: true },
    });
    const refundId =
      existing?.id ??
      (
        await this.prisma.refund.create({
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            amountCents,
            reason: 'Remboursement effectué chez le prestataire de paiement',
            providerRefundId,
          },
          select: { id: true },
        })
      ).id;
    await this.finalize(refundId);
    return true;
  }

  private async execute(
    paymentId: string,
    request: RefundRequest,
    actorId: string | null,
  ): Promise<string> {
    const refund = await this.prisma.$transaction(async (tx) => {
      // Verrou du paiement : deux remboursements simultanés ne dépassent jamais le montant payé.
      const [payment] = await tx.$queryRaw<
        {
          id: string;
          order_id: string;
          status: PaymentStatus;
          amount_cents: number;
          refunded_cents: number;
        }[]
      >`SELECT id, order_id, status, amount_cents, refunded_cents FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      if (!payment || !REFUNDABLE.includes(payment.status)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.CONFLICT,
          'Ce paiement n’est pas remboursable.',
        );
      }
      const pending = await tx.refund.aggregate({
        where: { paymentId, status: 'pending' },
        _sum: { amountCents: true },
      });
      const refundable =
        payment.amount_cents - payment.refunded_cents - (pending._sum.amountCents ?? 0);
      const amount = request.amountCents ?? refundable;
      if (refundable <= 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.CONFLICT,
          'Ce paiement est déjà entièrement remboursé.',
        );
      }
      if (amount <= 0 || amount > refundable) {
        throw fieldError('amountCents', `au plus ${formatEuros(refundable)} remboursables`);
      }
      const created = await tx.refund.create({
        data: {
          paymentId,
          orderId: payment.order_id,
          amountCents: amount,
          reason: request.reason,
          actorId,
          restocked: request.restock && amount === payment.amount_cents - payment.refunded_cents,
        },
        select: { id: true, amountCents: true },
      });
      await this.audit.log(
        {
          action: AuditAction.REFUND_REQUESTED,
          actorId,
          targetType: 'order',
          targetId: payment.order_id,
          metadata: { amountCents: amount, automatic: actorId === null },
        },
        tx,
      );
      return created;
    });

    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { provider: true, providerPaymentId: true },
    });
    let result: RefundResult;
    try {
      if (!payment.providerPaymentId)
        throw new PaymentProviderError('Paiement sans identifiant prestataire');
      result =
        payment.provider === 'stripe'
          ? await this.stripe.refund(payment.providerPaymentId, refund.amountCents, refund.id)
          : await this.paypal.refund(payment.providerPaymentId, refund.amountCents, refund.id);
    } catch (error) {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'failed', failureReason: (error as Error).message.slice(0, 300) },
      });
      await this.audit.log({
        action: AuditAction.REFUND_FAILED,
        actorId,
        targetType: 'refund',
        targetId: refund.id,
      });
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        ErrorCode.PAYMENT_PROVIDER_ERROR,
        'Le prestataire de paiement a refusé le remboursement. Merci de réessayer ou de le faire depuis son tableau de bord.',
      );
    }
    await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        providerRefundId: result.providerRefundId,
        ...(result.status === 'failed'
          ? { status: 'failed', failureReason: 'Refusé par le prestataire' }
          : {}),
      },
    });
    if (result.status === 'succeeded') await this.finalize(refund.id);
    return refund.id;
  }

  /** Remboursement confirmé : montants du paiement et de la commande, statut, stock, e-mail. */
  private async finalize(refundId: string): Promise<void> {
    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refund.updateMany({
        where: { id: refundId, status: { in: ['pending', 'failed'] } },
        data: { status: 'succeeded', failureReason: null },
      });
      if (claimed.count === 0) return null;
      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        select: {
          amountCents: true,
          paymentId: true,
          orderId: true,
          restocked: true,
          actorId: true,
          reason: true,
        },
      });
      const payment = await tx.payment.update({
        where: { id: refund.paymentId },
        data: { refundedCents: { increment: refund.amountCents } },
        select: { amountCents: true, refundedCents: true },
      });
      await tx.payment.update({
        where: { id: refund.paymentId },
        data: {
          status: payment.refundedCents >= payment.amountCents ? 'refunded' : 'partially_refunded',
        },
      });
      // Paiement en double (la commande a été réglée par un paiement antérieur) : il est rendu
      // sans toucher aux montants ni au statut de la commande, qui reste due et payée une fois.
      const primary = await tx.payment.findFirst({
        where: { orderId: refund.orderId, succeededAt: { not: null } },
        orderBy: { succeededAt: 'asc' },
        select: { id: true },
      });
      const duplicate = primary !== null && primary.id !== refund.paymentId;
      let full = false;
      if (!duplicate) {
        const order = await tx.order.update({
          where: { id: refund.orderId },
          data: { refundedCents: { increment: refund.amountCents } },
          select: {
            status: true,
            totalCents: true,
            refundedCents: true,
            items: { select: { variantId: true, quantity: true } },
          },
        });
        full = order.refundedCents >= order.totalCents;
        if (full && canTransition(order.status, 'refunded')) {
          await tx.order.update({ where: { id: refund.orderId }, data: { status: 'refunded' } });
          await tx.orderEvent.create({
            data: {
              orderId: refund.orderId,
              fromStatus: order.status,
              toStatus: 'refunded',
              actorId: refund.actorId,
              note: `Remboursement intégral : ${refund.reason}`,
            },
          });
        }
        if (refund.restocked && full) {
          await this.ledger.restock(
            tx,
            refund.orderId,
            order.items.flatMap((item) =>
              item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : [],
            ),
            refund.actorId,
          );
        }
      }
      await this.audit.log(
        {
          action: AuditAction.REFUND_SUCCEEDED,
          actorId: refund.actorId,
          targetType: 'order',
          targetId: refund.orderId,
          metadata: { amountCents: refund.amountCents, full, duplicate },
        },
        tx,
      );
      return { ...refund, full };
    });
    if (done) await this.notifyCustomer(done.orderId, done.amountCents, done.reason, done.full);
  }

  private async notifyCustomer(
    orderId: string,
    amountCents: number,
    reason: string,
    full: boolean,
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { email: true, firstName: true, number: true },
      });
      await this.mail.send('order-refunded', order.email, {
        firstName: order.firstName,
        reference: orderReference(order.number),
        amount: formatEuros(amountCents),
        reason,
        full,
        trackingLink: this.orders.trackingLink(orderId),
      });
    } catch (error) {
      this.logger.error({ err: error }, `E-mail de remboursement non envoyé (commande ${orderId})`);
    }
  }
}
