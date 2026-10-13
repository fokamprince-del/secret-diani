import type { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PAYMENT_FETCH } from '../../src/payments/payments.constants';
import { PaymentsService } from '../../src/payments/payments.service';
import { PayPalGateway } from '../../src/payments/gateways/paypal.gateway';
import { StripeGateway } from '../../src/payments/gateways/stripe.gateway';
import { ReconciliationService } from '../../src/payments/reconciliation.service';
import { RefundsService } from '../../src/payments/refunds.service';
import { WebhookHandlerService } from '../../src/payments/webhooks/webhook-handler.service';
import { MailService } from '../../src/mail/mail.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrderExpiryService } from '../../src/shop/orders/order-expiry.service';
import { StockLedger } from '../../src/shop/stock/stock-ledger';
import { type AdminSession, createAdminSession } from './utils/admin-helpers';
import { API, client, MailInbox, registerVerifiedUser, uniqueEmail } from './utils/auth-helpers';
import { FakePaymentProviders } from './utils/fake-payments';
import { createTestApp } from './utils/test-app';

const CSRF = { 'X-CSRF-Token': '1' };
const ADDRESS = {
  firstName: 'Awa',
  lastName: 'Diallo',
  line1: '2 avenue des Roses',
  postalCode: '75011',
  city: 'Paris',
  country: 'FR',
};
const WEBHOOK_SECRET = 'whsec_e2e0123456789';
const signer = new Stripe('sk_test_signature_only');

interface PlacedOrder {
  orderId: string;
  token: string;
  totalCents: number;
  email: string;
}

describe('Paiements (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: AdminSession;
  let adminEmail: string;
  let handler: WebhookHandlerService;
  const fake = new FakePaymentProviders();
  const inbox = new MailInbox();
  const unique = Date.now().toString(36).toUpperCase();
  let variantId: string;
  let pickupId: string;

  const pub = () => client(app);

  /** Panier invité d'un article puis validation : commande en attente, stock réservé. */
  async function placeOrder(quantity = 1): Promise<PlacedOrder> {
    const http = pub();
    const email = uniqueEmail('paiement');
    const added = await http
      .post('/shop/cart/items')
      .set(CSRF)
      .send({ variantId, quantity })
      .expect(200);
    const cookie = (added.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const res = await http
      .post('/shop/checkout')
      .set(CSRF)
      .set('Cookie', cookie)
      .send({
        email,
        firstName: 'Awa',
        lastName: 'D',
        shippingRateId: pickupId,
        billingAddress: ADDRESS,
        acceptTerms: true,
      })
      .expect(201);
    return {
      orderId: res.body.orderId,
      token: res.body.trackingToken,
      totalCents: res.body.totalCents,
      email,
    };
  }

  async function startPayment(order: PlacedOrder, provider: 'stripe' | 'paypal') {
    return pub().post('/payments/checkout').send({ token: order.token, provider }).expect(201);
  }

  function stripeWebhook(
    event: Record<string, unknown>,
    options: { timestamp?: number; secret?: string } = {},
  ) {
    const payload = JSON.stringify(event);
    const header = signer.webhooks.generateTestHeaderString({
      payload,
      secret: options.secret ?? WEBHOOK_SECRET,
      ...(options.timestamp ? { timestamp: options.timestamp } : {}),
    });
    return request(app.getHttpServer())
      .post(`${API}/payments/webhooks/stripe`)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', header)
      .send(payload);
  }

  function sessionCompleted(sessionId: string, overrides: Record<string, unknown> = {}) {
    const session = fake.sessionJson(fake.markStripePaid(sessionId));
    return {
      id: `evt_${sessionId}_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { ...session, ...overrides } },
    };
  }

  /** Traitement du worker, exécuté ici directement (le worker ne tourne pas en e2e). */
  async function processPending(): Promise<void> {
    const events = await prisma.webhookEvent.findMany({
      where: { status: 'received' },
      select: { id: true },
    });
    for (const event of events) await handler.process(event.id);
  }

  function paypalWebhook(
    event: Record<string, unknown>,
    signature = 'signature-valide',
    sentAt = new Date(),
  ) {
    return request(app.getHttpServer())
      .post(`${API}/payments/webhooks/paypal`)
      .set('Content-Type', 'application/json')
      .set({
        'PayPal-Auth-Algo': 'SHA256withRSA',
        'PayPal-Cert-Url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42',
        'PayPal-Transmission-Id': `tr-${Math.random().toString(36).slice(2)}`,
        'PayPal-Transmission-Sig': signature,
        'PayPal-Transmission-Time': sentAt.toISOString(),
      })
      .send(JSON.stringify(event));
  }

  beforeAll(async () => {
    app = await createTestApp([], [{ provide: PAYMENT_FETCH, useValue: fake.fetch }]);
    prisma = app.get(PrismaService);
    handler = new WebhookHandlerService(prisma, app.get(PaymentsService), app.get(RefundsService));
    admin = await createAdminSession(app);
    adminEmail = (await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).email;

    const product = await admin.http
      .post('/admin/shop/products', admin.accessToken)
      .send({
        name: `Spatule coudée ${unique}`,
        kind: 'accessory',
        variants: [{ sku: `SPAT-${unique}`, label: 'Inox', priceCents: 1_290, weightGrams: 90 }],
      })
      .expect(201);
    variantId = product.body.variants[0].id as string;
    await admin.http
      .post(`/admin/shop/stock/${variantId}/adjust`, admin.accessToken)
      .send({ delta: 40, note: 'Réassort' })
      .expect(200);
    const pickup = await admin.http
      .post('/admin/shop/shipping-rates', admin.accessToken)
      .send({ name: `Retrait ${unique}`, method: 'pickup', priceCents: 0 })
      .expect(201);
    pickupId = pickup.body.id as string;
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  it('annonce les moyens de paiement configurés', async () => {
    await pub().get('/payments/methods').expect(200, { stripe: true, paypal: true });
  });

  describe('Stripe Checkout', () => {
    let order: PlacedOrder;
    let sessionId: string;
    let paymentId: string;

    it('ouvre une page Stripe au montant du serveur et prolonge la réservation du stock', async () => {
      order = await placeOrder(2);
      const res = await startPayment(order, 'stripe');
      expect(res.body.redirectUrl).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
      paymentId = res.body.paymentId as string;
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      sessionId = payment.providerSessionId!;
      expect(payment).toMatchObject({
        status: 'pending',
        amountCents: 2 * 1_290,
        provider: 'stripe',
      });
      expect(fake.sessions.get(sessionId)!.amountTotal).toBe(order.totalCents);
      const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      expect(stored.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 35 * 60_000);
      // Double clic : même page réutilisée.
      const again = await startPayment(order, 'stripe');
      expect(again.body.paymentId).toBe(paymentId);
    });

    it('refuse un lien de commande falsifié', async () => {
      await pub()
        .post('/payments/checkout')
        .send({ token: 'A'.repeat(43), provider: 'stripe' })
        .expect(404);
      await pub()
        .post('/payments/checkout')
        .send({ token: order.token, provider: 'bitcoin' })
        .expect(400);
    });

    it('refuse un webhook mal signé, modifié, trop ancien ou sans signature', async () => {
      const event = sessionCompleted(sessionId);
      const forged = await stripeWebhook(event, { secret: 'whsec_autre_secret' }).expect(400);
      expect(forged.body.code).toBe('WEBHOOK_REJECTED');
      const old = Math.floor(Date.now() / 1000) - 10 * 60;
      await stripeWebhook(event, { timestamp: old }).expect(400);
      const valid = signer.webhooks.generateTestHeaderString({
        payload: JSON.stringify(event),
        secret: WEBHOOK_SECRET,
      });
      await request(app.getHttpServer())
        .post(`${API}/payments/webhooks/stripe`)
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', valid)
        .send(
          JSON.stringify({ ...event, data: { object: { ...event.data.object, amount_total: 1 } } }),
        )
        .expect(400);
      await request(app.getHttpServer())
        .post(`${API}/payments/webhooks/stripe`)
        .send('{}')
        .expect(400);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe(
        'pending_payment',
      );
      expect(
        await prisma.auditLog.count({ where: { action: 'payment.webhook_rejected' } }),
      ).toBeGreaterThanOrEqual(3);
    });

    it('webhook signé : enregistré une fois, traité par le worker, commande payée et facturée', async () => {
      const event = sessionCompleted(sessionId);
      const res = await stripeWebhook(event).expect(200);
      expect(res.body).toEqual({ received: true, duplicate: false });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe(
        'pending_payment',
      );
      await processPending();
      const paid = await prisma.order.findUniqueOrThrow({
        where: { id: order.orderId },
        include: { invoice: true },
      });
      expect(paid.status).toBe('paid');
      expect(paid.invoice).not.toBeNull();
      expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({
        status: 'succeeded',
        providerPaymentId: fake.sessions.get(sessionId)!.paymentIntent,
      });

      // Rejeu du même événement : accusé de réception, aucun second traitement.
      const replay = await stripeWebhook(event).expect(200);
      expect(replay.body).toEqual({ received: true, duplicate: true });
      await processPending();
      expect(
        await prisma.shopStockMovement.count({ where: { orderId: order.orderId, reason: 'sale' } }),
      ).toBe(1);
      expect(await prisma.invoice.count({ where: { orderId: order.orderId } })).toBe(1);
      expect(await prisma.webhookEvent.count({ where: { eventId: event.id } })).toBe(1);
    });

    it('un nouveau paiement d’une commande payée est refusé', async () => {
      const res = await pub()
        .post('/payments/checkout')
        .send({ token: order.token, provider: 'stripe' })
        .expect(409);
      expect(res.body.code).toBe('ALREADY_PAID');
    });

    it('montant reçu incohérent : commande non validée, administration alertée', async () => {
      const other = await placeOrder();
      const started = await startPayment(other, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      await stripeWebhook(sessionCompleted(session, { amount_total: 1 })).expect(200);
      await processPending();
      expect((await prisma.order.findUniqueOrThrow({ where: { id: other.orderId } })).status).toBe(
        'pending_payment',
      );
      expect(
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } }),
      ).toMatchObject({
        status: 'failed',
        failureReason: 'Montant reçu différent du montant attendu',
      });
      const alert = await inbox.last(adminEmail, 'payment-alert');
      expect(alert.data.title).toBe('montant incohérent');
    });

    it('deux webhooks simultanés pour la même session : une seule vente', async () => {
      const other = await placeOrder();
      const started = await startPayment(other, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      await Promise.all([
        stripeWebhook(sessionCompleted(session)),
        stripeWebhook(sessionCompleted(session)),
      ]);
      const events = await prisma.webhookEvent.findMany({
        where: { status: 'received' },
        select: { id: true },
      });
      await Promise.all(events.map((event) => handler.process(event.id)));
      expect((await prisma.order.findUniqueOrThrow({ where: { id: other.orderId } })).status).toBe(
        'paid',
      );
      expect(
        await prisma.shopStockMovement.count({ where: { orderId: other.orderId, reason: 'sale' } }),
      ).toBe(1);
    });
  });

  describe('PayPal', () => {
    it('ouvre la page PayPal puis, au retour, le serveur capture et valide la commande', async () => {
      const order = await placeOrder();
      const started = await startPayment(order, 'paypal');
      expect(started.body.redirectUrl).toMatch(
        /^https:\/\/www\.sandbox\.paypal\.com\/checkoutnow\?token=PPORDER-/,
      );
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: started.body.paymentId },
      });
      expect(fake.paypalOrders.get(payment.providerSessionId!)!.amount).toBe('12.90');
      fake.approvePayPal(payment.providerSessionId!);
      const res = await pub()
        .post('/payments/paypal/capture')
        .send({ token: order.token })
        .expect(200);
      expect(res.body).toMatchObject({ outcome: 'paid', order: { status: 'paid' } });
      // Retour rejoué (actualisation de la page) : rien de plus.
      const again = await pub()
        .post('/payments/paypal/capture')
        .send({ token: order.token })
        .expect(200);
      expect(again.body.outcome).toBe('already_processed');
    });

    it('paiement refusé par PayPal : commande toujours en attente, autre moyen possible', async () => {
      const order = await placeOrder();
      await startPayment(order, 'paypal');
      fake.declineNextCapture = true;
      const res = await pub()
        .post('/payments/paypal/capture')
        .send({ token: order.token })
        .expect(402);
      expect(res.body.code).toBe('PAYMENT_FAILED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe(
        'pending_payment',
      );
      await startPayment(order, 'stripe');
    });

    it('webhook PayPal vérifié auprès de PayPal (signature et horodatage)', async () => {
      const order = await placeOrder();
      const started = await startPayment(order, 'paypal');
      const paypalOrderId = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      fake.approvePayPal(paypalOrderId);
      const approved = {
        id: `WH-${Math.random().toString(36).slice(2)}`,
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: { id: paypalOrderId },
      };
      await paypalWebhook(approved, 'signature-falsifiee').expect(400);
      await paypalWebhook(approved, 'signature-valide', new Date(Date.now() - 10 * 60_000)).expect(
        400,
      );
      await paypalWebhook({ ...approved, constructor: { prototype: 1 } }).expect(400);
      // La cliente a fermé l'onglet après validation : le webhook déclenche la capture.
      await paypalWebhook(approved).expect(200);
      await processPending();
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe(
        'paid',
      );
    });
  });

  describe('remboursements automatiques', () => {
    it('double paiement (Stripe puis PayPal) : le second est remboursé automatiquement', async () => {
      const order = await placeOrder();
      const stripe = await startPayment(order, 'stripe');
      const paypal = await startPayment(order, 'paypal');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: stripe.body.paymentId } })
      ).providerSessionId!;
      const paypalOrderId = (
        await prisma.payment.findUniqueOrThrow({ where: { id: paypal.body.paymentId } })
      ).providerSessionId!;
      fake.approvePayPal(paypalOrderId);
      // Capture PayPal avant que la page Stripe ne soit fermée.
      await app.get(PayPalGateway).capture(paypalOrderId, paypal.body.paymentId as string);
      await stripeWebhook(sessionCompleted(session)).expect(200);
      await processPending();
      const capture = fake.paypalOrders.get(paypalOrderId)!;
      await paypalWebhook({
        id: `WH-${Math.random().toString(36).slice(2)}`,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: capture.captureId,
          status: 'COMPLETED',
          custom_id: paypal.body.paymentId,
          amount: { value: '12.90', currency_code: 'EUR' },
        },
      }).expect(200);
      await processPending();

      expect(
        await prisma.payment.findUniqueOrThrow({ where: { id: paypal.body.paymentId } }),
      ).toMatchObject({ status: 'refunded', refundedCents: 1_290 });
      expect(fake.paypalRefunds.at(-1)).toMatchObject({
        captureId: capture.captureId,
        amount: '12.90',
      });
      const mail = await inbox.last(order.email, 'order-refunded');
      expect(mail.data).toMatchObject({
        reason: 'Paiement en double pour la même commande',
        full: false,
      });
      // La commande, payée une fois, reste payée : le doublon ne compte pas dans ses remboursements.
      expect(await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).toMatchObject({
        status: 'paid',
        refundedCents: 0,
      });
    });

    it('paiement confirmé après expiration, plus de stock : remboursement intégral automatique', async () => {
      const order = await placeOrder();
      const started = await startPayment(order, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      await prisma.order.update({
        where: { id: order.orderId },
        data: { reservationExpiresAt: new Date(Date.now() - 1_000) },
      });
      await new OrderExpiryService(prisma, new StockLedger()).expireOverdue();
      const stock = await prisma.shopStock.findUniqueOrThrow({ where: { variantId } });
      await admin.http
        .post(`/admin/shop/stock/${variantId}/adjust`, admin.accessToken)
        .send({ delta: -(stock.onHand - stock.reserved), note: 'Inventaire : rupture' })
        .expect(200);

      await stripeWebhook(sessionCompleted(session)).expect(200);
      await processPending();
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe(
        'cancelled',
      );
      expect(
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } }),
      ).toMatchObject({ status: 'refunded' });
      expect(fake.stripeRefunds.at(-1)).toMatchObject({ amount: order.totalCents });
      const mail = await inbox.last(order.email, 'order-refunded');
      expect(mail.data.reason).toContain('épuisé');

      await admin.http
        .post(`/admin/shop/stock/${variantId}/adjust`, admin.accessToken)
        .send({ delta: 20, note: 'Réassort' })
        .expect(200);
    });

    it('une commande expirée ne peut plus être payée', async () => {
      const order = await placeOrder();
      await prisma.order.update({
        where: { id: order.orderId },
        data: { reservationExpiresAt: new Date(Date.now() - 1_000) },
      });
      const res = await pub()
        .post('/payments/checkout')
        .send({ token: order.token, provider: 'stripe' })
        .expect(409);
      expect(res.body.code).toBe('PAYMENT_EXPIRED');
    });
  });

  describe('remboursements par l’administration', () => {
    let order: PlacedOrder;

    beforeAll(async () => {
      order = await placeOrder(3);
      const started = await startPayment(order, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      await stripeWebhook(sessionCompleted(session)).expect(200);
      await processPending();
    });

    it('réservé à l’administration', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      await cliente.http
        .post(`/admin/shop/orders/${order.orderId}/refunds`, cliente.accessToken)
        .send({ reason: 'test' })
        .expect(403);
    });

    it('remboursement partiel : montants à jour, commande toujours payée', async () => {
      const res = await admin.http
        .post(`/admin/shop/orders/${order.orderId}/refunds`, admin.accessToken)
        .send({ amountCents: 1_000, reason: 'Geste commercial' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'paid', refundedCents: 1_000 });
      const payments = await admin.http
        .get(`/admin/shop/orders/${order.orderId}/payments`, admin.accessToken)
        .expect(200);
      expect(payments.body[0]).toMatchObject({
        status: 'partially_refunded',
        refundedCents: 1_000,
      });
      expect(payments.body[0].refunds[0]).toMatchObject({
        amountCents: 1_000,
        status: 'succeeded',
        actorId: admin.userId,
      });
      const mail = await inbox.last(order.email, 'order-refunded');
      expect(mail.data).toMatchObject({ amount: '10,00 €', full: false });
    });

    it('refuse de rembourser plus que le restant', async () => {
      const res = await admin.http
        .post(`/admin/shop/orders/${order.orderId}/refunds`, admin.accessToken)
        .send({ amountCents: order.totalCents, reason: 'Trop' })
        .expect(400);
      expect(res.body.errors[0].messages[0]).toBe('au plus 28,70 € remboursables');
    });

    it('remboursement du restant avec remise en stock : commande remboursée', async () => {
      const before = await prisma.shopStock.findUniqueOrThrow({ where: { variantId } });
      const res = await admin.http
        .post(`/admin/shop/orders/${order.orderId}/refunds`, admin.accessToken)
        .send({ reason: 'Retour des articles', restock: true })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'refunded', refundedCents: order.totalCents });
      // Commande entièrement remboursée avec retour des articles : les 3 pièces reviennent en stock.
      const after = await prisma.shopStock.findUniqueOrThrow({ where: { variantId } });
      expect(after.onHand).toBe(before.onHand + 3);
      await admin.http
        .post(`/admin/shop/orders/${order.orderId}/refunds`, admin.accessToken)
        .send({ reason: 'Encore' })
        .expect(409);
    });

    it('remboursement intégral d’un coup avec remise en stock', async () => {
      const full = await placeOrder(2);
      const started = await startPayment(full, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      await stripeWebhook(sessionCompleted(session)).expect(200);
      await processPending();
      const before = await prisma.shopStock.findUniqueOrThrow({ where: { variantId } });
      await admin.http
        .post(`/admin/shop/orders/${full.orderId}/refunds`, admin.accessToken)
        .send({ reason: 'Annulation à la demande de la cliente', restock: true })
        .expect(200);
      expect((await prisma.shopStock.findUniqueOrThrow({ where: { variantId } })).onHand).toBe(
        before.onHand + 2,
      );
    });

    it('remboursement en attente chez Stripe : finalisé par le webhook', async () => {
      const pending = await placeOrder();
      const started = await startPayment(pending, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      await stripeWebhook(sessionCompleted(session)).expect(200);
      await processPending();
      fake.stripeRefundStatus = 'pending';
      await admin.http
        .post(`/admin/shop/orders/${pending.orderId}/refunds`, admin.accessToken)
        .send({ reason: 'Erreur de commande' })
        .expect(200);
      fake.stripeRefundStatus = 'succeeded';
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: pending.orderId } });
      expect(refund.status).toBe('pending');
      await stripeWebhook({
        id: `evt_ref_${refund.id}`,
        object: 'event',
        type: 'refund.updated',
        data: {
          object: {
            id: refund.providerRefundId,
            object: 'refund',
            status: 'succeeded',
            amount: refund.amountCents,
          },
        },
      }).expect(200);
      await processPending();
      expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe(
        'succeeded',
      );
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: pending.orderId } })).status,
      ).toBe('refunded');
    });

    it('remboursement fait depuis le tableau de bord Stripe : enregistré pour garder les comptes justes', async () => {
      const external = await placeOrder();
      const started = await startPayment(external, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      await stripeWebhook(sessionCompleted(session)).expect(200);
      await processPending();
      const intent = fake.sessions.get(session)!.paymentIntent;
      await stripeWebhook({
        id: `evt_charge_${session}`,
        object: 'event',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_1',
            object: 'charge',
            payment_intent: intent,
            amount_refunded: 500,
            refunds: {
              object: 'list',
              data: [
                {
                  id: `re_dashboard_${session}`,
                  object: 'refund',
                  status: 'succeeded',
                  amount: 500,
                },
              ],
            },
          },
        },
      }).expect(200);
      await processPending();
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: external.orderId } })).refundedCents,
      ).toBe(500);
    });

    it('litige : paiement signalé, administration alertée', async () => {
      const disputed = await placeOrder();
      const started = await startPayment(disputed, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
      ).providerSessionId!;
      await stripeWebhook(sessionCompleted(session)).expect(200);
      await processPending();
      await stripeWebhook({
        id: `evt_dispute_${session}`,
        object: 'event',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_1',
            object: 'dispute',
            payment_intent: fake.sessions.get(session)!.paymentIntent,
            reason: 'fraudulent',
            amount: 1_290,
          },
        },
      }).expect(200);
      await processPending();
      expect(
        (await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })).status,
      ).toBe('disputed');
      expect((await inbox.last(adminEmail, 'payment-alert')).data.title).toBe('litige ouvert');
    });
  });

  describe('réconciliation quotidienne', () => {
    it('rattrape un paiement Stripe dont le webhook est perdu et une validation PayPal non capturée', async () => {
      const lostStripe = await placeOrder();
      const stripe = await startPayment(lostStripe, 'stripe');
      const session = (
        await prisma.payment.findUniqueOrThrow({ where: { id: stripe.body.paymentId } })
      ).providerSessionId!;
      fake.markStripePaid(session);

      const lostPayPal = await placeOrder();
      const paypal = await startPayment(lostPayPal, 'paypal');
      const paypalOrderId = (
        await prisma.payment.findUniqueOrThrow({ where: { id: paypal.body.paymentId } })
      ).providerSessionId!;
      fake.approvePayPal(paypalOrderId);
      await prisma.payment.update({
        where: { id: paypal.body.paymentId },
        data: { createdAt: new Date(Date.now() - 20 * 60_000) },
      });

      const reconciliation = new ReconciliationService(
        prisma,
        app.get(StripeGateway),
        app.get(PayPalGateway),
        app.get(PaymentsService),
        app.get(MailService),
      );
      const report = await reconciliation.run();
      expect(report.stripeRecovered).toBeGreaterThanOrEqual(1);
      expect(report.paypalRecovered).toBe(1);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: lostStripe.orderId } })).status,
      ).toBe('paid');
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: lostPayPal.orderId } })).status,
      ).toBe('paid');
    });
  });
});
