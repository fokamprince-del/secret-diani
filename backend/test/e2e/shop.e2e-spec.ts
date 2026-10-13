import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import type request from 'supertest';
import type { App } from 'supertest/types';
import { sha256Hex } from '../../src/common/crypto/hash';
import { AppConfigService } from '../../src/config/app-config.service';
import { MediaProcessingService } from '../../src/media/media-processing.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { InvoicesService } from '../../src/shop/invoices/invoices.service';
import { OrderExpiryService } from '../../src/shop/orders/order-expiry.service';
import { OrdersService } from '../../src/shop/orders/orders.service';
import { StockLedger } from '../../src/shop/stock/stock-ledger';
import { StorageService } from '../../src/storage/storage.service';
import { type AdminSession, createAdminSession } from './utils/admin-helpers';
import {
  client,
  type Client,
  login,
  MailInbox,
  PASSWORD,
  registerVerifiedUser,
  uniqueEmail,
} from './utils/auth-helpers';
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

/** Panier invité : le cookie `diani_cart` est conservé d'une requête à l'autre. */
class GuestCart {
  cookie: string | null = null;

  constructor(readonly http: Client) {}

  private withCookie(req: request.Test): request.Test {
    return this.cookie ? req.set('Cookie', `diani_cart=${this.cookie}`) : req;
  }

  private remember(res: request.Response): request.Response {
    const header = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((value) =>
      value.startsWith('diani_cart='),
    );
    if (header) this.cookie = header.split(';')[0]!.slice('diani_cart='.length);
    return res;
  }

  async add(variantId: string, quantity: number, expected = 200): Promise<request.Response> {
    const res = await this.withCookie(this.http.post('/shop/cart/items'))
      .set(CSRF)
      .send({ variantId, quantity })
      .expect(expected);
    return this.remember(res);
  }

  view(country?: string): request.Test {
    return this.withCookie(this.http.get(`/shop/cart${country ? `?country=${country}` : ''}`));
  }

  set(variantId: string, quantity: number): request.Test {
    return this.withCookie(this.http.patch(`/shop/cart/items/${variantId}`))
      .set(CSRF)
      .send({ quantity });
  }

  checkout(body: Record<string, unknown>): request.Test {
    return this.withCookie(this.http.post('/shop/checkout'))
      .set(CSRF)
      .send({ acceptTerms: true, ...body });
  }
}

describe('Boutique (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let admin: AdminSession;
  let adminEmail: string;
  const inbox = new MailInbox();
  const unique = Date.now().toString(36).toUpperCase();
  const slug = (name: string) => `${name}-${unique.toLowerCase()}`;

  let kitId: string;
  let kitVariantId: string;
  let accessoryVariantA: string;
  let accessoryVariantB: string;
  let colissimoId: string;
  let pickupId: string;

  const pub = () => client(app);
  /** Service du worker (absent de l'API), exécuté ici contre la base de test. */
  const expiry = () => new OrderExpiryService(prisma, new StockLedger());

  async function createProduct(body: Record<string, unknown>): Promise<request.Response> {
    return admin.http.post('/admin/shop/products', admin.accessToken).send(body).expect(201);
  }

  async function restock(variantId: string, delta: number): Promise<void> {
    await admin.http
      .post(`/admin/shop/stock/${variantId}/adjust`, admin.accessToken)
      .send({ delta, note: 'Réassort' })
      .expect(200);
  }

  async function stockOf(variantId: string) {
    return prisma.shopStock.findUniqueOrThrow({ where: { variantId } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    const storage = app.get(StorageService);
    await storage.ensureBuckets();
    admin = await createAdminSession(app);
    adminEmail = (await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).email;

    const photo = await sharp({
      create: { width: 800, height: 800, channels: 3, background: '#F0E2D9' },
    })
      .jpeg()
      .toBuffer();
    const media = await admin.http
      .post('/admin/media', admin.accessToken)
      .attach('file', photo, { filename: 'kit.jpg', contentType: 'image/jpeg' })
      .expect(201);
    await new MediaProcessingService(prisma, storage, app.get(AppConfigService)).process(
      media.body.id as string,
    );

    const kit = await createProduct({
      name: `Kit Débutant ${unique}`,
      kind: 'kit',
      shortDescription: 'Tout pour commencer la pâtisserie.',
      descriptionMarkdown: '## Contenu\n\nUn kit **complet**. <script>alert(1)</script>',
      variants: [
        { sku: `KIT-DEB-${unique}`, label: 'Standard', priceCents: 3_799, weightGrams: 600 },
      ],
      composition: [
        { label: 'Poche à douille', quantity: 1 },
        { label: 'Douilles', quantity: 6 },
      ],
      images: [{ mediaId: media.body.id, alt: 'Kit débutant ouvert' }],
    });
    kitId = kit.body.id as string;
    kitVariantId = kit.body.variants[0].id as string;
    await createProduct({
      name: `Kit Expert ${unique}`,
      kind: 'kit',
      variants: [
        { sku: `KIT-EXP-${unique}`, label: 'Standard', priceCents: 5_999, weightGrams: 900 },
      ],
      composition: [
        { label: 'poche à  douille', quantity: 2 },
        { label: 'Lisseur', quantity: 1 },
      ],
    });
    const accessory = await createProduct({
      name: `Poches à douille ${unique}`,
      kind: 'accessory',
      variants: [
        { sku: `POCHE-S-${unique}`, label: 'Lot de 3', priceCents: 590, weightGrams: 80 },
        { sku: `POCHE-L-${unique}`, label: 'Lot de 10', priceCents: 1_490, weightGrams: 200 },
      ],
    });
    accessoryVariantA = accessory.body.variants[0].id as string;
    accessoryVariantB = accessory.body.variants[1].id as string;

    await restock(kitVariantId, 3);
    await restock(accessoryVariantA, 50);
    await restock(accessoryVariantB, 1);

    // Tarifs dédiés à ce test, placés en tête.
    await prisma.shippingRate.updateMany({ data: { active: false } });
    const colissimo = await admin.http
      .post('/admin/shop/shipping-rates', admin.accessToken)
      .send({
        name: 'Colissimo',
        method: 'delivery',
        countries: ['FR'],
        maxWeightGrams: 2_000,
        priceCents: 790,
        freeFromCents: 8_000,
        delay: '2 à 4 jours ouvrés',
      })
      .expect(201);
    colissimoId = colissimo.body.id as string;
    const pickup = await admin.http
      .post('/admin/shop/shipping-rates', admin.accessToken)
      .send({ name: 'Retrait à l’atelier', method: 'pickup', priceCents: 0 })
      .expect(201);
    pickupId = pickup.body.id as string;
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  describe('catalogue', () => {
    it('refuse l’administration de la boutique à une cliente et à un anonyme', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      await cliente.http.get('/admin/shop/products', cliente.accessToken).expect(403);
      await cliente.http.get('/admin/shop/orders', cliente.accessToken).expect(403);
      await pub().get('/admin/shop/stock').expect(401);
    });

    it('liste les produits avec la disponibilité en direct (« plus que 3 »)', async () => {
      const res = await pub().get('/shop/products?kind=kit').expect(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
      );
      const kit = (
        res.body as { slug: string; availability: unknown; fromPriceCents: number }[]
      ).find((product) => product.slug === slug('kit-debutant'))!;
      expect(kit).toMatchObject({
        fromPriceCents: 3_799,
        availability: { status: 'low_stock', remaining: 3 },
      });
    });

    it('fiche produit : HTML assaini, composition, offres schema.org', async () => {
      const res = await pub()
        .get(`/shop/products/${slug('kit-debutant')}`)
        .expect(200);
      expect(res.body.descriptionHtml).toContain('<strong>complet</strong>');
      expect(res.body.descriptionHtml).not.toContain('<script');
      expect(res.body.composition).toEqual([
        { label: 'Poche à douille', quantity: 1, details: null },
        { label: 'Douilles', quantity: 6, details: null },
      ]);
      expect(res.body.image).toMatchObject({ alt: 'Kit débutant ouvert' });
      expect(res.body.seo.canonicalUrl).toBe(
        `http://localhost:5173/boutique/${slug('kit-debutant')}`,
      );
      expect(res.body.jsonLd.offers[0]).toMatchObject({
        '@type': 'Offer',
        sku: `KIT-DEB-${unique}`,
        price: '37.99',
        priceCurrency: 'EUR',
        availability: 'https://schema.org/LimitedAvailability',
      });
    });

    it('les fiches produits figurent dans le sitemap', async () => {
      const res = await pub().get('/seo/sitemap').expect(200);
      expect((res.body as { loc: string }[]).map((entry) => entry.loc)).toContain(
        `http://localhost:5173/boutique/${slug('kit-debutant')}`,
      );
    });

    it('tableau comparatif des kits (éléments rapprochés malgré casse et espaces)', async () => {
      const res = await pub().get('/shop/kits/comparison').expect(200);
      const columns = (res.body.kits as { slug: string }[]).map((kit) => kit.slug);
      const debutant = columns.indexOf(slug('kit-debutant'));
      const expert = columns.indexOf(slug('kit-expert'));
      expect(debutant).toBeLessThan(expert);
      const poche = (res.body.rows as { label: string; values: (number | null)[] }[]).find(
        (row) => row.label === 'Poche à douille',
      )!;
      expect(poche.values[debutant]).toBe(1);
      expect(poche.values[expert]).toBe(2);
    });
  });

  describe('panier invité', () => {
    it('exige l’en-tête CSRF pour modifier le panier', async () => {
      await pub()
        .post('/shop/cart/items')
        .send({ variantId: kitVariantId, quantity: 1 })
        .expect(403);
    });

    it('crée le panier invité dans un cookie HttpOnly, Secure, SameSite=Strict, limité à /api/v1/shop', async () => {
      const cart = new GuestCart(pub());
      const res = await cart.add(kitVariantId, 1);
      const header = (res.headers['set-cookie'] as unknown as string[]).find((value) =>
        value.startsWith('diani_cart='),
      )!;
      expect(header).toMatch(/HttpOnly/);
      expect(header).toMatch(/Secure/);
      expect(header).toMatch(/SameSite=Strict/);
      expect(header).toMatch(/Path=\/api\/v1\/shop/);
      expect(res.body).toMatchObject({ itemCount: 1, subtotalCents: 3_799, checkoutReady: true });
      // Un autre visiteur (cookie inventé) ne voit pas ce panier.
      const other = await pub()
        .get('/shop/cart')
        .set('Cookie', 'diani_cart=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
        .expect(200);
      expect(other.body.items).toEqual([]);
    });

    it('refuse un prix envoyé par le client, plus que le stock, ou plus que le plafond par article', async () => {
      const cart = new GuestCart(pub());
      await cart.http
        .post('/shop/cart/items')
        .set(CSRF)
        .send({ variantId: kitVariantId, quantity: 1, priceCents: 1 })
        .expect(400);
      const stock = await cart.add(kitVariantId, 4, 409);
      expect(stock.body).toMatchObject({ code: 'OUT_OF_STOCK' });
      expect(stock.body.message).toContain('il en reste 3');
      const ceiling = await cart.add(accessoryVariantA, 11, 409);
      expect(ceiling.body.code).toBe('QUANTITY_LIMIT');
    });

    it('calcule sous-total, poids et options de livraison pour le pays demandé', async () => {
      const cart = new GuestCart(pub());
      await cart.add(kitVariantId, 1);
      await cart.add(accessoryVariantA, 2);
      const res = await cart.view('FR').expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({
        subtotalCents: 3_799 + 2 * 590,
        weightGrams: 760,
        itemCount: 3,
      });
      expect(
        (res.body.shippingOptions as { id: string; priceCents: number }[]).map((o) => [
          o.id,
          o.priceCents,
        ]),
      ).toEqual([
        [pickupId, 0],
        [colissimoId, 790],
      ]);
      const abroad = await cart.view('US').expect(200);
      expect((abroad.body.shippingOptions as { id: string }[]).map((o) => o.id)).toEqual([
        pickupId,
      ]);
      const updated = await cart.set(accessoryVariantA, 0).expect(200);
      expect(updated.body.itemCount).toBe(1);
    });
  });

  describe('commande, stock et paiement', () => {
    let cart: GuestCart;
    let orderId: string;
    let trackingToken: string;
    const email = uniqueEmail('boutique');

    it('valide les informations de commande avant toute réservation', async () => {
      cart = new GuestCart(pub());
      await cart.add(kitVariantId, 2);
      const noEmail = await cart
        .checkout({
          firstName: 'Awa',
          lastName: 'Diallo',
          shippingRateId: colissimoId,
          shippingAddress: ADDRESS,
        })
        .expect(400);
      expect(noEmail.body.errors[0].field).toBe('email');
      const noAddress = await cart
        .checkout({ email, firstName: 'Awa', lastName: 'Diallo', shippingRateId: colissimoId })
        .expect(400);
      expect(noAddress.body.errors[0].field).toBe('shippingAddress');
      const abroad = await cart
        .checkout({
          email,
          firstName: 'Awa',
          lastName: 'Diallo',
          shippingRateId: colissimoId,
          shippingAddress: { ...ADDRESS, country: 'US' },
        })
        .expect(400);
      expect(abroad.body.errors[0].field).toBe('shippingRateId');
      await cart
        .checkout({
          email,
          firstName: 'Awa',
          lastName: 'Diallo',
          shippingRateId: colissimoId,
          shippingAddress: ADDRESS,
          acceptTerms: false,
        })
        .expect(400);
      expect((await stockOf(kitVariantId)).reserved).toBe(0);
    });

    it('crée la commande « en attente de paiement » et réserve le stock 15 minutes', async () => {
      const res = await cart
        .checkout({
          email,
          firstName: '=HYPERLINK("http://x")',
          lastName: 'Diallo',
          shippingRateId: colissimoId,
          shippingAddress: ADDRESS,
        })
        .expect(201);
      orderId = res.body.orderId as string;
      trackingToken = res.body.trackingToken as string;
      expect(res.body.reference).toMatch(/^CMD-\d{6}$/);
      expect(res.body.totalCents).toBe(2 * 3_799 + 790);
      const minutes =
        (new Date(res.body.reservationExpiresAt as string).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(14);
      expect(minutes).toBeLessThanOrEqual(15);
      expect(await stockOf(kitVariantId)).toMatchObject({ onHand: 3, reserved: 2 });
      const listing = await pub()
        .get(`/shop/products/${slug('kit-debutant')}`)
        .expect(200);
      expect(listing.body.variants[0].availability).toEqual({ status: 'low_stock', remaining: 1 });
    });

    it('revalider le même panier remplace la commande en attente (jamais deux réservations)', async () => {
      // Autre IP, même panier : la première IP a atteint la limite de 5 validations par 10 minutes.
      cart = Object.assign(new GuestCart(pub()), { cookie: cart.cookie });
      const again = await cart
        .checkout({
          email,
          firstName: '=HYPERLINK("http://x")',
          lastName: 'Diallo',
          shippingRateId: colissimoId,
          shippingAddress: ADDRESS,
        })
        .expect(201);
      expect(await stockOf(kitVariantId)).toMatchObject({ onHand: 3, reserved: 2 });
      const previous = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(previous).toMatchObject({
        status: 'cancelled',
        cancellationReason: 'Remplacée par une nouvelle validation du panier',
      });
      orderId = again.body.orderId as string;
      trackingToken = again.body.trackingToken as string;
    });

    it('le lien de suivi signé affiche la commande ; un lien falsifié est refusé', async () => {
      const res = await pub().get(`/shop/orders/track?token=${trackingToken}`).expect(200);
      expect(res.body).toMatchObject({
        id: orderId,
        status: 'pending_payment',
        statusLabel: 'En attente de paiement',
        invoiceAvailable: false,
      });
      const forged = `${trackingToken.slice(0, -3)}${trackingToken.endsWith('AAA') ? 'BBB' : 'AAA'}`;
      await pub().get(`/shop/orders/track?token=${forged}`).expect(404);
      await pub().get('/shop/orders/track?token=court').expect(400);
    });

    it('paiement confirmé : stock vendu, facture numérotée, panier vidé, e-mail, idempotent', async () => {
      await expect(orders.markPaid(orderId, { provider: 'test', reference: 'pi_1' })).resolves.toBe(
        'paid',
      );
      expect(await stockOf(kitVariantId)).toMatchObject({ onHand: 1, reserved: 0 });
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { invoice: true },
      });
      expect(order.status).toBe('paid');
      expect(order.invoice?.number).toMatch(/^F-\d{4}-\d{5}$/);
      const view = await cart.view().expect(200);
      expect(view.body.items).toEqual([]);

      const confirmation = await inbox.last(email, 'order-confirmed');
      expect(confirmation.data).toMatchObject({ total: '83,88 €', shipping: '7,90 €' });
      expect(confirmation.data.trackingLink).toBe(
        `http://localhost:5173/commande/suivi?token=${trackingToken}`,
      );

      // Rejoué (webhook reçu deux fois) : aucune seconde vente.
      await expect(orders.markPaid(orderId, { provider: 'test', reference: 'pi_1' })).resolves.toBe(
        'already_paid',
      );
      expect(await stockOf(kitVariantId)).toMatchObject({ onHand: 1, reserved: 0 });
      const sales = await prisma.shopStockMovement.count({ where: { orderId, reason: 'sale' } });
      expect(sales).toBe(1);
    });

    it('alerte « stock bas » envoyée une seule fois aux administratrices', async () => {
      const alerts = (await inbox.all(adminEmail)).filter(
        (mail) =>
          mail.template === 'stock-low' &&
          mail.data.lines.some((line) => line.includes(`KIT-DEB-${unique}`)),
      );
      expect(alerts).toHaveLength(1);
    });

    it('facture PDF : produite par le worker, téléchargeable, inaltérable', async () => {
      const invoiceUrl = `/shop/orders/track/invoice?token=${trackingToken}`;
      const notReady = await pub().get(invoiceUrl).expect(409);
      expect(notReady.body.code).toBe('DOCUMENT_NOT_READY');

      const invoice = await prisma.invoice.findUniqueOrThrow({ where: { orderId } });
      await app.get(InvoicesService).renderPdf(invoice.id);
      const res = await pub().get(invoiceUrl).expect(200);
      const pdf = await fetch(res.body.url as string);
      expect(pdf.status).toBe(200);
      expect(
        Buffer.from(await pdf.arrayBuffer())
          .subarray(0, 5)
          .toString('latin1'),
      ).toBe('%PDF-');

      await expect(
        prisma.invoice.update({ where: { id: invoice.id }, data: { totalCents: 1 } }),
      ).rejects.toThrow(/inaltérable/);
      await expect(prisma.invoice.delete({ where: { id: invoice.id } })).rejects.toThrow(/10 ans/);
      const tracked = await pub().get(`/shop/orders/track?token=${trackingToken}`).expect(200);
      expect(tracked.body.invoiceAvailable).toBe(true);
    });

    it('numérotation des factures continue, sans trou', async () => {
      const second = new GuestCart(pub());
      await second.add(accessoryVariantA, 1);
      const res = await second
        .checkout({
          email: uniqueEmail('boutique'),
          firstName: 'Mariam',
          lastName: 'K',
          shippingRateId: pickupId,
          billingAddress: ADDRESS,
        })
        .expect(201);
      await orders.markPaid(res.body.orderId as string, { provider: 'test', reference: 'pi_2' });
      const [first, next] = await Promise.all([
        prisma.invoice.findUniqueOrThrow({ where: { orderId } }),
        prisma.invoice.findUniqueOrThrow({ where: { orderId: res.body.orderId as string } }),
      ]);
      expect(next.year).toBe(first.year);
      expect(next.sequence).toBe(first.sequence + 1);
    });

    it('jamais de survente : 5 paniers pour 1 dernière pièce, une seule commande passe', async () => {
      const carts = Array.from({ length: 5 }, () => new GuestCart(pub()));
      for (const guest of carts) await guest.add(accessoryVariantB, 1);
      const results = await Promise.all(
        carts.map((guest) =>
          guest.checkout({
            email: uniqueEmail('course'),
            firstName: 'Awa',
            lastName: 'D',
            shippingRateId: pickupId,
            billingAddress: ADDRESS,
          }),
        ),
      );
      expect(results.filter((res) => res.status === 201)).toHaveLength(1);
      for (const res of results.filter((r) => r.status !== 201)) {
        expect(res.status).toBe(409);
        expect(['OUT_OF_STOCK', 'CART_CHANGED']).toContain(res.body.code);
      }
      expect(await stockOf(accessoryVariantB)).toMatchObject({ onHand: 1, reserved: 1 });
    });

    it('expiration : stock libéré ; un paiement tardif revend s’il reste du stock, sinon remboursement requis', async () => {
      const late = new GuestCart(pub());
      await late.add(accessoryVariantA, 2);
      const created = await late
        .checkout({
          email: uniqueEmail('tard'),
          firstName: 'Awa',
          lastName: 'D',
          shippingRateId: pickupId,
          billingAddress: ADDRESS,
        })
        .expect(201);
      const id = created.body.orderId as string;
      const before = await stockOf(accessoryVariantA);
      await prisma.order.update({
        where: { id },
        data: { reservationExpiresAt: new Date(Date.now() - 1_000) },
      });
      expect(await expiry().expireOverdue()).toBeGreaterThanOrEqual(1);
      expect(await prisma.order.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: 'cancelled',
        cancellationReason: 'Paiement non reçu dans le délai',
      });
      expect((await stockOf(accessoryVariantA)).reserved).toBe(before.reserved - 2);
      await expect(orders.markPaid(id, { provider: 'test', reference: 'pi_late' })).resolves.toBe(
        'paid',
      );
      expect((await stockOf(accessoryVariantA)).onHand).toBe(before.onHand - 2);

      // Plus de stock du tout : le paiement tardif ne vend rien et doit être remboursé.
      const scarce = new GuestCart(pub());
      const lastOrderId = (
        await prisma.order.findFirstOrThrow({
          where: { items: { some: { variantId: accessoryVariantB } }, status: 'pending_payment' },
        })
      ).id;
      await prisma.order.update({
        where: { id: lastOrderId },
        data: { reservationExpiresAt: new Date(Date.now() - 1_000) },
      });
      await expiry().expireOverdue();
      await scarce.add(accessoryVariantB, 1);
      const taken = await scarce
        .checkout({
          email: uniqueEmail('rapide'),
          firstName: 'Awa',
          lastName: 'D',
          shippingRateId: pickupId,
          billingAddress: ADDRESS,
        })
        .expect(201);
      await orders.markPaid(taken.body.orderId as string, {
        provider: 'test',
        reference: 'pi_fast',
      });
      await expect(
        orders.markPaid(lastOrderId, { provider: 'test', reference: 'pi_slow' }),
      ).resolves.toBe('stock_unavailable');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: lastOrderId } })).status).toBe(
        'cancelled',
      );
      expect(await stockOf(accessoryVariantB)).toMatchObject({ onHand: 0, reserved: 0 });
    });

    describe('administration des commandes', () => {
      it('recherche par référence ou e-mail ; détail avec notes, adresse de facturation et étapes possibles', async () => {
        const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        const reference = `CMD-${String(order.number).padStart(6, '0')}`;
        for (const q of [reference, email]) {
          const res = await admin.http
            .get(`/admin/shop/orders?q=${encodeURIComponent(q)}`, admin.accessToken)
            .expect(200);
          expect((res.body.items as { id: string }[]).map((item) => item.id)).toContain(orderId);
        }
        const detail = await admin.http
          .get(`/admin/shop/orders/${orderId}`, admin.accessToken)
          .expect(200);
        expect(detail.body).toMatchObject({
          status: 'paid',
          nextStatuses: ['preparing', 'shipped'],
          billingAddress: ADDRESS,
        });
        expect((detail.body.timeline as { note: string | null }[]).at(-1)?.note).toBe(
          'Paiement reçu (test, pi_1)',
        );
        // Vue cliente : pas de notes internes.
        const tracked = await pub().get(`/shop/orders/track?token=${trackingToken}`).expect(200);
        expect(
          (tracked.body.timeline as { note: string | null }[]).every(
            (event) => event.note === null,
          ),
        ).toBe(true);
      });

      it('préparation puis expédition avec suivi : e-mail envoyé ; pas d’annulation d’une commande payée', async () => {
        await admin.http
          .post(`/admin/shop/orders/${orderId}/status`, admin.accessToken)
          .send({ status: 'preparing' })
          .expect(200);
        const refused = await admin.http
          .post(`/admin/shop/orders/${orderId}/status`, admin.accessToken)
          .send({ status: 'cancelled', note: 'test' })
          .expect(409);
        expect(refused.body.code).toBe('INVALID_STATUS_TRANSITION');
        const shipped = await admin.http
          .post(`/admin/shop/orders/${orderId}/status`, admin.accessToken)
          .send({ status: 'shipped', carrier: 'Colissimo', trackingNumber: '6A12345678901' })
          .expect(200);
        expect(shipped.body).toMatchObject({
          status: 'shipped',
          carrier: 'Colissimo',
          trackingNumber: '6A12345678901',
        });
        const mail = await inbox.last(email, 'order-shipped');
        expect(mail.data).toMatchObject({ trackingNumber: '6A12345678901', carrier: 'Colissimo' });
        await admin.http
          .post(`/admin/shop/orders/${orderId}/status`, admin.accessToken)
          .send({ status: 'delivered' })
          .expect(200);
      });

      it('annuler une commande non payée exige un motif et libère le stock', async () => {
        const pending = new GuestCart(pub());
        await pending.add(accessoryVariantA, 3);
        const created = await pending
          .checkout({
            email: uniqueEmail('annule'),
            firstName: 'Awa',
            lastName: 'D',
            shippingRateId: pickupId,
            billingAddress: ADDRESS,
          })
          .expect(201);
        const id = created.body.orderId as string;
        const reserved = (await stockOf(accessoryVariantA)).reserved;
        await admin.http
          .post(`/admin/shop/orders/${id}/status`, admin.accessToken)
          .send({ status: 'cancelled' })
          .expect(400);
        await admin.http
          .post(`/admin/shop/orders/${id}/status`, admin.accessToken)
          .send({ status: 'cancelled', note: 'Doublon signalé par la cliente' })
          .expect(200);
        expect((await stockOf(accessoryVariantA)).reserved).toBe(reserved - 3);
      });

      it('export CSV : BOM, séparateur « ; », formules neutralisées', async () => {
        const res = await admin.http
          .get('/admin/shop/orders/export?status=delivered', admin.accessToken)
          .expect(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toBe('attachment; filename="commandes.csv"');
        const csv = res.text;
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain('"Référence";"Date"');
        expect(csv).toContain('"\'=HYPERLINK(""http://x"") Diallo"');
        expect(csv).not.toMatch(/;"=HYPERLINK/);
      });

      it('stock : impossible de descendre sous les réservations ; historique des mouvements', async () => {
        const pending = new GuestCart(pub());
        await pending.add(accessoryVariantA, 2);
        await pending
          .checkout({
            email: uniqueEmail('stock'),
            firstName: 'Awa',
            lastName: 'D',
            shippingRateId: pickupId,
            billingAddress: ADDRESS,
          })
          .expect(201);
        const current = await stockOf(accessoryVariantA);
        const refused = await admin.http
          .post(`/admin/shop/stock/${accessoryVariantA}/adjust`, admin.accessToken)
          .send({ delta: -(current.onHand - current.reserved + 1), note: 'Inventaire' })
          .expect(409);
        expect(refused.body.message).toContain('réservées');
        const movements = await admin.http
          .get(`/admin/shop/stock/${accessoryVariantA}/movements`, admin.accessToken)
          .expect(200);
        expect((movements.body as { reason: string }[]).map((movement) => movement.reason)).toEqual(
          expect.arrayContaining(['adjustment', 'sale']),
        );
      });

      it('une variante déjà vendue n’est jamais effacée : elle est désactivée', async () => {
        const res = await admin.http
          .patch(`/admin/shop/products/${kitId}`, admin.accessToken)
          .send({
            variants: [
              {
                sku: `KIT-DEB2-${unique}`,
                label: 'Édition 2',
                priceCents: 3_999,
                weightGrams: 650,
              },
            ],
          })
          .expect(200);
        const variants = res.body.variants as { id: string; active: boolean }[];
        expect(variants.find((variant) => variant.id === kitVariantId)).toMatchObject({
          active: false,
        });
        await pub()
          .post('/shop/cart/items')
          .set(CSRF)
          .send({ variantId: kitVariantId, quantity: 1 })
          .expect(404);
        await admin.http
          .post('/admin/shop/products', admin.accessToken)
          .send({
            name: 'Doublon',
            kind: 'accessory',
            variants: [{ sku: `KIT-DEB2-${unique}`, label: 'X', priceCents: 1, weightGrams: 1 }],
          })
          .expect(409);
      });
    });
  });

  describe('cliente connectée', () => {
    it('fusionne le panier invité à la connexion, commande avec son compte, voit ses commandes ; anti-IDOR', async () => {
      const email = uniqueEmail('membre');
      const http = pub();
      await http
        .post('/auth/register')
        .send({ email, password: PASSWORD, acceptTerms: true })
        .expect(202);
      const verify = await inbox.last(email, 'verify-email');
      await http
        .post('/auth/email/verify')
        .send({ token: new URL(verify.data.link).searchParams.get('token') })
        .expect(200);

      const guest = new GuestCart(http);
      await guest.add(accessoryVariantA, 2);
      const session = await login(http, email, PASSWORD);
      const merged = await http
        .post('/shop/cart/merge', session.accessToken)
        .set(CSRF)
        .set('Cookie', `diani_cart=${guest.cookie}`)
        .expect(200);
      expect(merged.body.itemCount).toBe(2);
      const cleared = (merged.headers['set-cookie'] as unknown as string[]).find((value) =>
        value.startsWith('diani_cart='),
      )!;
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(
        await prisma.shopCart.findUnique({ where: { guestTokenHash: sha256Hex(guest.cookie!) } }),
      ).toBeNull();

      const placed = await http
        .post('/shop/checkout', session.accessToken)
        .set(CSRF)
        .send({
          firstName: 'Fatou',
          lastName: 'S',
          shippingRateId: pickupId,
          billingAddress: ADDRESS,
          acceptTerms: true,
          email: 'ignore@example.com',
        })
        .expect(201);
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: placed.body.orderId as string },
      });
      expect(order).toMatchObject({ email, userId: session.userId });

      const mine = await http.get('/me/orders', session.accessToken).expect(200);
      expect((mine.body.items as { id: string }[]).map((item) => item.id)).toContain(order.id);
      await http.get(`/me/orders/${order.id}`, session.accessToken).expect(200);

      const intruder = await registerVerifiedUser(app, inbox);
      await intruder.http.get(`/me/orders/${order.id}`, intruder.accessToken).expect(404);
      await intruder.http.get(`/me/orders/${order.id}/invoice`, intruder.accessToken).expect(404);
      await pub().get('/me/orders').expect(401);

      const exported = await http.get('/me/export', session.accessToken).expect(200);
      expect(exported.body.orders).toEqual(
        expect.arrayContaining([expect.objectContaining({ email })]),
      );
    });

    it('un jeton invalide sur une route du panier est refusé (jamais traité en invité)', async () => {
      await pub().get('/shop/cart', 'jeton-invalide').expect(401);
    });
  });
});
