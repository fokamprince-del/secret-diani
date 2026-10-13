import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { PaymentProvider, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { type PayPalWebhookHeaders, PayPalGateway } from '../gateways/paypal.gateway';
import { StripeGateway } from '../gateways/stripe.gateway';
import { PAYMENTS_QUEUE, WEBHOOK_JOB, type WebhookJobData } from '../payments.constants';

export interface WebhookAck {
  received: true;
  duplicate: boolean;
}

function rejected(): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.WEBHOOK_REJECTED,
    'Signature invalide.',
  );
}

/**
 * Réception des webhooks : signature et horodatage vérifiés AVANT toute lecture, corps brut
 * (octets signés), événement enregistré une seule fois (identifiant unique du prestataire) puis
 * traité de façon asynchrone par le worker, avec relances. Réponse immédiate au prestataire.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeGateway,
    private readonly paypal: PayPalGateway,
    private readonly audit: AuditService,
    @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue<WebhookJobData>,
  ) {}

  async receiveStripe(rawBody: unknown, signature: string | undefined): Promise<WebhookAck> {
    if (!this.stripe.enabled) throw rejected();
    if (!Buffer.isBuffer(rawBody) || !signature) return this.reject('stripe');
    let event: { id: string; type: string };
    try {
      event = this.stripe.verifyWebhook(rawBody, signature);
    } catch {
      return this.reject('stripe');
    }
    return this.record('stripe', event.id, event.type, event);
  }

  async receivePayPal(rawBody: unknown, headers: PayPalWebhookHeaders): Promise<WebhookAck> {
    if (!this.paypal.enabled) throw rejected();
    if (!Buffer.isBuffer(rawBody)) return this.reject('paypal');
    let event: { id?: unknown; event_type?: unknown };
    try {
      event = JSON.parse(rawBody.toString('utf8'), (key, value: unknown) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype')
          throw new SyntaxError();
        return value;
      }) as typeof event;
    } catch {
      return this.reject('paypal');
    }
    if (typeof event.id !== 'string' || typeof event.event_type !== 'string')
      return this.reject('paypal');
    let valid: boolean;
    try {
      valid = await this.paypal.verifyWebhook(headers, event);
    } catch (error) {
      // PayPal injoignable : réponse 503, PayPal renverra l'événement plus tard.
      this.logger.error({ err: error }, 'Vérification d’un webhook PayPal impossible');
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SERVICE_UNAVAILABLE,
        'Vérification momentanément impossible.',
      );
    }
    if (!valid) return this.reject('paypal');
    return this.record('paypal', event.id, event.event_type, event as Prisma.InputJsonValue);
  }

  private async record(
    provider: PaymentProvider,
    eventId: string,
    type: string,
    payload: Prisma.InputJsonValue,
  ): Promise<WebhookAck> {
    const created = await this.prisma.webhookEvent.createMany({
      data: [{ provider, eventId: eventId.slice(0, 255), type: type.slice(0, 100), payload }],
      skipDuplicates: true,
    });
    const stored = await this.prisma.webhookEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider, eventId: eventId.slice(0, 255) } },
      select: { id: true, status: true },
    });
    // Rejeu d'un événement déjà traité : accusé de réception, aucun nouveau traitement.
    if (created.count === 0 && stored.status !== 'failed')
      return { received: true, duplicate: true };
    // Identifiant de tâche unique par réception (BullMQ ignore un identifiant déjà vu) : un
    // événement en échec renvoyé par le prestataire est bien retraité.
    const jobId = created.count > 0 ? `webhook-${stored.id}` : `webhook-${stored.id}-${Date.now()}`;
    await this.queue.add(WEBHOOK_JOB, { webhookEventId: stored.id }, { jobId });
    return { received: true, duplicate: created.count === 0 };
  }

  private async reject(provider: PaymentProvider): Promise<never> {
    await this.audit.log({ action: AuditAction.WEBHOOK_REJECTED, metadata: { provider } });
    throw rejected();
  }
}
