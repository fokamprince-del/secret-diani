/**
 * Faux prestataires de paiement pour les tests e2e : remplace `fetch` (jeton PAYMENT_FETCH).
 * Le SDK Stripe officiel et le client PayPal s'exécutent réellement ; seules les réponses
 * réseau de Stripe et de PayPal sont simulées, avec un état en mémoire.
 */
interface FakeSession {
  id: string;
  paymentId: string;
  amountTotal: number;
  paid: boolean;
  paymentIntent: string;
}

interface FakePayPalOrder {
  id: string;
  paymentId: string;
  amount: string;
  status: 'PAYER_ACTION_REQUIRED' | 'APPROVED' | 'COMPLETED';
  captureId: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': `req_${Date.now()}` },
  });
}

export class FakePaymentProviders {
  readonly sessions = new Map<string, FakeSession>();
  readonly paypalOrders = new Map<string, FakePayPalOrder>();
  readonly stripeRefunds: { id: string; paymentIntent: string; amount: number }[] = [];
  readonly paypalRefunds: { id: string; captureId: string; amount: string }[] = [];
  /** Prochaine capture PayPal refusée (carte refusée). */
  declineNextCapture = false;
  /** Statut renvoyé par Stripe à la création d'un remboursement. */
  stripeRefundStatus: 'succeeded' | 'pending' = 'succeeded';
  private counter = 0;

  readonly fetch: typeof fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : '';
    if (url.hostname === 'api.stripe.com') return Promise.resolve(this.stripe(method, url, body));
    if (url.hostname.endsWith('paypal.com')) return Promise.resolve(this.paypal(method, url, body));
    return Promise.reject(new Error(`Appel réseau inattendu : ${url.href}`));
  };

  /** La cliente a payé sur Stripe (sans que le webhook soit encore arrivé). */
  markStripePaid(sessionId: string): FakeSession {
    const session = this.sessions.get(sessionId)!;
    session.paid = true;
    return session;
  }

  /** La cliente a validé sur PayPal (avant la capture par le serveur). */
  approvePayPal(orderId: string): void {
    this.paypalOrders.get(orderId)!.status = 'APPROVED';
  }

  private next(prefix: string): string {
    this.counter += 1;
    return `${prefix}${Date.now().toString(36)}${this.counter}`;
  }

  private stripe(method: string, url: URL, body: string): Response {
    const form = new URLSearchParams(body);
    const path = url.pathname;
    if (method === 'POST' && path === '/v1/checkout/sessions') {
      let total = 0;
      for (let i = 0; form.has(`line_items[${i}][quantity]`); i += 1) {
        total +=
          Number(form.get(`line_items[${i}][quantity]`)) *
          Number(form.get(`line_items[${i}][price_data][unit_amount]`));
      }
      const id = this.next('cs_test_');
      this.sessions.set(id, {
        id,
        paymentId: form.get('metadata[paymentId]') ?? '',
        amountTotal: total,
        paid: false,
        paymentIntent: this.next('pi_'),
      });
      return json(this.sessionJson(this.sessions.get(id)!));
    }
    const expire = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(path);
    if (method === 'POST' && expire)
      return json({ id: expire[1], object: 'checkout.session', status: 'expired' });
    if (method === 'GET' && path === '/v1/checkout/sessions') {
      return json({
        object: 'list',
        url: '/v1/checkout/sessions',
        has_more: false,
        data: [...this.sessions.values()]
          .filter((session) => session.paid)
          .map((session) => this.sessionJson(session)),
      });
    }
    if (method === 'POST' && path === '/v1/refunds') {
      const refund = {
        id: this.next('re_'),
        paymentIntent: form.get('payment_intent') ?? '',
        amount: Number(form.get('amount')),
      };
      this.stripeRefunds.push(refund);
      return json({
        id: refund.id,
        object: 'refund',
        status: this.stripeRefundStatus,
        amount: refund.amount,
        payment_intent: refund.paymentIntent,
      });
    }
    return json({ error: { message: `Route Stripe simulée inconnue : ${method} ${path}` } }, 404);
  }

  sessionJson(session: FakeSession): Record<string, unknown> {
    return {
      id: session.id,
      object: 'checkout.session',
      url: `https://checkout.stripe.com/c/pay/${session.id}`,
      amount_total: session.amountTotal,
      currency: 'eur',
      payment_status: session.paid ? 'paid' : 'unpaid',
      status: session.paid ? 'complete' : 'open',
      payment_intent: session.paid ? session.paymentIntent : null,
      metadata: { paymentId: session.paymentId },
    };
  }

  private paypal(method: string, url: URL, body: string): Response {
    const path = url.pathname;
    if (method === 'POST' && path === '/v1/oauth2/token')
      return json({ access_token: 'A21-fake', expires_in: 32_400 });
    if (method === 'POST' && path === '/v2/checkout/orders') {
      const request = JSON.parse(body) as {
        purchase_units: { custom_id: string; amount: { value: string } }[];
      };
      const id = this.next('PPORDER-');
      this.paypalOrders.set(id, {
        id,
        paymentId: request.purchase_units[0]!.custom_id,
        amount: request.purchase_units[0]!.amount.value,
        status: 'PAYER_ACTION_REQUIRED',
        captureId: null,
      });
      return json({
        id,
        status: 'PAYER_ACTION_REQUIRED',
        links: [
          { rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` },
        ],
      });
    }
    const capture = /^\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(path);
    if (method === 'POST' && capture) {
      const order = this.paypalOrders.get(capture[1]!);
      if (!order) return json({ name: 'RESOURCE_NOT_FOUND' }, 404);
      if (this.declineNextCapture) {
        this.declineNextCapture = false;
        return json(
          { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] },
          422,
        );
      }
      // Idempotence de PayPal : une même requête de capture renvoie la même capture.
      order.captureId ??= this.next('CAP-');
      order.status = 'COMPLETED';
      return json(this.paypalOrderJson(order));
    }
    const get = /^\/v2\/checkout\/orders\/([^/]+)$/.exec(path);
    if (method === 'GET' && get) {
      const order = this.paypalOrders.get(get[1]!);
      return order ? json(this.paypalOrderJson(order)) : json({ name: 'RESOURCE_NOT_FOUND' }, 404);
    }
    const refund = /^\/v2\/payments\/captures\/([^/]+)\/refund$/.exec(path);
    if (method === 'POST' && refund) {
      const request = JSON.parse(body) as { amount: { value: string } };
      const created = {
        id: this.next('PPREF-'),
        captureId: refund[1]!,
        amount: request.amount.value,
      };
      this.paypalRefunds.push(created);
      return json({ id: created.id, status: 'COMPLETED' });
    }
    if (method === 'POST' && path === '/v1/notifications/verify-webhook-signature') {
      const request = JSON.parse(body) as { transmission_sig: string; webhook_id: string };
      const valid =
        request.transmission_sig === 'signature-valide' && request.webhook_id === 'WH-E2E-0001';
      return json({ verification_status: valid ? 'SUCCESS' : 'FAILURE' });
    }
    return json({ name: 'NOT_FOUND', message: `${method} ${path}` }, 404);
  }

  paypalOrderJson(order: FakePayPalOrder): Record<string, unknown> {
    return {
      id: order.id,
      status: order.status,
      purchase_units: [
        {
          custom_id: order.paymentId,
          payments: order.captureId
            ? {
                captures: [
                  {
                    id: order.captureId,
                    status: 'COMPLETED',
                    custom_id: order.paymentId,
                    amount: { value: order.amount, currency_code: 'EUR' },
                  },
                ],
              }
            : undefined,
        },
      ],
    };
  }
}
