import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { centsToDecimal, decimalToCents } from '../domain/amounts';
import { PAYMENT_FETCH, type PaymentFetch } from '../payments.constants';
import {
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvidence,
  PaymentProviderError,
  type RefundResult,
} from './gateway.types';

const BASE_URLS = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
} as const;
const TOKEN_KEY = 'payments:paypal:token';
const TIMEOUT_MS = 15_000;
/** Horodatage d'un webhook accepté (anti-rejeu) : 5 minutes. */
const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

interface PayPalLink {
  rel: string;
  href: string;
}

interface PayPalCapture {
  id: string;
  status: string;
  amount?: { value: string; currency_code: string };
}

export interface PayPalOrderState {
  status: string;
  capture: PayPalCapture | null;
}

/** En-têtes de signature d'un webhook PayPal. */
export interface PayPalWebhookHeaders {
  authAlgo?: string;
  certUrl?: string;
  transmissionId?: string;
  transmissionSig?: string;
  transmissionTime?: string;
}

function captureOf(order: {
  purchase_units?: { payments?: { captures?: PayPalCapture[] } }[];
}): PayPalCapture | null {
  return order.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
}

export function captureEvidence(capture: PayPalCapture | null): PaymentEvidence | null {
  if (!capture?.amount || capture.status !== 'COMPLETED') return null;
  return {
    providerPaymentId: capture.id,
    amountCents: decimalToCents(capture.amount.value),
    currency: capture.amount.currency_code,
  };
}

/**
 * PayPal (API REST v2, commandes en « capture ») : la cliente valide sur la page PayPal, puis
 * le serveur capture le paiement et vérifie le montant. Jeton OAuth mis en cache dans Redis,
 * clé d'idempotence (`PayPal-Request-Id`) sur chaque création. Aucun appel vers une URL
 * fournie par l'utilisateur : hôtes fixes selon l'environnement (sandbox ou production).
 */
@Injectable()
export class PayPalGateway {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly webhookId: string | undefined;
  private readonly baseUrl: string;

  constructor(
    config: AppConfigService,
    @Inject(PAYMENT_FETCH) private readonly fetchImpl: PaymentFetch,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.clientId = config.get('PAYPAL_CLIENT_ID');
    this.clientSecret = config.get('PAYPAL_CLIENT_SECRET');
    this.webhookId = config.get('PAYPAL_WEBHOOK_ID');
    this.baseUrl = BASE_URLS[config.get('PAYPAL_ENVIRONMENT')];
  }

  get enabled(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.webhookId);
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const itemTotal = request.lines.reduce(
      (sum, line) => sum + line.unitAmountCents * line.quantity,
      0,
    );
    const order = await this.request<{ id: string; links?: PayPalLink[] }>(
      'POST',
      '/v2/checkout/orders',
      {
        requestId: `checkout-${request.paymentId}`,
        body: {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: request.orderId,
              custom_id: request.paymentId,
              invoice_id: request.orderReference,
              description: `Commande ${request.orderReference}`,
              amount: {
                currency_code: 'EUR',
                value: centsToDecimal(request.totalCents),
                breakdown: {
                  item_total: { currency_code: 'EUR', value: centsToDecimal(itemTotal) },
                },
              },
              items: request.lines.map((line) => ({
                name: line.name.slice(0, 127),
                quantity: String(line.quantity),
                unit_amount: { currency_code: 'EUR', value: centsToDecimal(line.unitAmountCents) },
              })),
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: 'Les Secrets de Diani',
                locale: 'fr-FR',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW',
                return_url: request.successUrl,
                cancel_url: request.cancelUrl,
              },
            },
          },
        },
      },
    );
    const approve = order.links?.find(
      (link) => link.rel === 'payer-action' || link.rel === 'approve',
    );
    if (!approve) throw new PaymentProviderError('Commande PayPal sans lien de validation');
    if (itemTotal !== request.totalCents) {
      throw new PaymentProviderError('Total des lignes PayPal différent de la commande');
    }
    return { sessionId: order.id, redirectUrl: approve.href };
  }

  /** Capture une commande validée par la cliente (idempotent côté PayPal). */
  async capture(paypalOrderId: string, paymentId: string): Promise<PayPalOrderState> {
    const order = await this.request<{
      status: string;
      purchase_units?: { payments?: { captures?: PayPalCapture[] } }[];
    }>('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      requestId: `capture-${paymentId}`,
    });
    return { status: order.status, capture: captureOf(order) };
  }

  async getOrder(paypalOrderId: string): Promise<PayPalOrderState> {
    const order = await this.request<{
      status: string;
      purchase_units?: { payments?: { captures?: PayPalCapture[] } }[];
    }>('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
    return { status: order.status, capture: captureOf(order) };
  }

  async refund(captureId: string, amountCents: number, refundId: string): Promise<RefundResult> {
    const refund = await this.request<{ id: string; status: string }>(
      'POST',
      `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
      {
        requestId: `refund-${refundId}`,
        body: {
          amount: { currency_code: 'EUR', value: centsToDecimal(amountCents) },
          invoice_id: refundId,
        },
      },
    );
    return {
      providerRefundId: refund.id,
      status:
        refund.status === 'COMPLETED'
          ? 'succeeded'
          : refund.status === 'FAILED' || refund.status === 'CANCELLED'
            ? 'failed'
            : 'pending',
    };
  }

  /**
   * Vérifie un webhook auprès de PayPal (signature, certificat, identifiant du webhook) et son
   * horodatage. Renvoie false pour tout webhook douteux.
   */
  async verifyWebhook(
    headers: PayPalWebhookHeaders,
    event: unknown,
    now = Date.now(),
  ): Promise<boolean> {
    const { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime } = headers;
    if (
      !this.webhookId ||
      !authAlgo ||
      !certUrl ||
      !transmissionId ||
      !transmissionSig ||
      !transmissionTime
    ) {
      return false;
    }
    const sentAt = Date.parse(transmissionTime);
    if (Number.isNaN(sentAt) || Math.abs(now - sentAt) > WEBHOOK_TOLERANCE_MS) return false;
    const result = await this.request<{ verification_status: string }>(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      {
        body: {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: this.webhookId,
          webhook_event: event,
        },
      },
    );
    return result.verification_status === 'SUCCESS';
  }

  private async accessToken(): Promise<string> {
    const cached = await this.redis.get(TOKEN_KEY);
    if (cached) return cached;
    if (!this.clientId || !this.clientSecret)
      throw new PaymentProviderError('PayPal non configuré');
    const response = await this.send(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const token = (await response.json()) as { access_token: string; expires_in: number };
    await this.redis.set(TOKEN_KEY, token.access_token, 'EX', Math.max(token.expires_in - 120, 60));
    return token.access_token;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { requestId?: string; body?: unknown } = {},
  ): Promise<T> {
    const token = await this.accessToken();
    const response = await this.send(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(options.requestId ? { 'PayPal-Request-Id': options.requestId } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    return (await response.json()) as T;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new PaymentProviderError(`PayPal injoignable : ${(error as Error).message}`);
    }
    if (response.status === 401) await this.redis.del(TOKEN_KEY);
    if (!response.ok) {
      throw new PaymentProviderError(
        `PayPal : réponse ${response.status} sur ${new URL(url).pathname}`,
      );
    }
    return response;
  }
}
