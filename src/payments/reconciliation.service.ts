import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { captureEvidence, PayPalGateway } from './gateways/paypal.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { PaymentsService } from './payments.service';

export interface ReconciliationReport {
  stripeRecovered: number;
  paypalRecovered: number;
  abandoned: number;
  anomalies: string[];
}

const HOUR = 3600_000;

/**
 * Réconciliation quotidienne entre les prestataires et la base (worker) : un webhook perdu ne
 * laisse jamais une commande payée en attente, et un écart est signalé à l'administration.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    private readonly paypal: PayPalGateway,
    private readonly payments: PaymentsService,
    private readonly mail: MailService,
  ) {}

  async run(now: Date = new Date()): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      stripeRecovered: 0,
      paypalRecovered: 0,
      abandoned: 0,
      anomalies: [],
    };

    if (this.stripe.enabled) {
      // Sessions payées des 48 dernières heures : chacune doit correspondre à un paiement réussi.
      for (const session of await this.stripe.paidSessionsSince(
        new Date(now.getTime() - 48 * HOUR),
      )) {
        if (!session.paymentId || !session.evidence) continue;
        const outcome = await this.payments.confirm(session.paymentId, session.evidence);
        if (outcome === 'paid' || outcome.startsWith('refunded')) report.stripeRecovered += 1;
        if (outcome === 'unknown_payment')
          report.anomalies.push(
            `Session Stripe ${session.sessionId} payée, paiement inconnu en base.`,
          );
        if (outcome === 'amount_mismatch')
          report.anomalies.push(`Session Stripe ${session.sessionId} : montant incohérent.`);
      }
    }

    if (this.paypal.enabled) {
      // Commandes PayPal restées en attente (retour non effectué, webhook perdu).
      const pending = await this.prisma.payment.findMany({
        where: {
          provider: 'paypal',
          status: 'pending',
          providerSessionId: { not: null },
          createdAt: {
            gte: new Date(now.getTime() - 72 * HOUR),
            lte: new Date(now.getTime() - 15 * 60_000),
          },
        },
        take: 200,
        select: { id: true, providerSessionId: true, order: { select: { status: true } } },
      });
      for (const payment of pending) {
        try {
          const state = await this.paypal.getOrder(payment.providerSessionId!);
          const evidence = captureEvidence(state.capture);
          if (state.status === 'COMPLETED' && evidence) {
            await this.payments.confirm(payment.id, evidence);
            report.paypalRecovered += 1;
          } else if (state.status === 'APPROVED' && payment.order.status === 'pending_payment') {
            await this.payments.captureAndConfirm(payment.id, payment.providerSessionId!);
            report.paypalRecovered += 1;
          }
        } catch (error) {
          report.anomalies.push(
            `Commande PayPal ${payment.providerSessionId} : vérification impossible (${(error as Error).message}).`,
          );
        }
      }
    }

    // Pages de paiement expirées depuis plus d'une heure sans confirmation : abandonnées.
    const abandoned = await this.prisma.payment.updateMany({
      where: { status: 'pending', expiresAt: { lt: new Date(now.getTime() - HOUR) } },
      data: { status: 'abandoned' },
    });
    report.abandoned = abandoned.count;

    this.logger.log({ report }, 'Réconciliation des paiements terminée');
    if (report.anomalies.length > 0) {
      await this.mail.sendToAdmins('payment-alert', {
        title: 'écarts de réconciliation',
        lines: report.anomalies.slice(0, 50),
      });
    }
    return report;
  }
}
