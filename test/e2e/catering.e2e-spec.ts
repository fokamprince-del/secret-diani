import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import type { App } from 'supertest/types';
import { CateringRequestsService } from '../../src/catering/requests/requests.service';
import { CateringSlotsService } from '../../src/catering/slots/slots.service';
import { addDays, parisToday } from '../../src/catering/domain/event-date';
import { AppConfigService } from '../../src/config/app-config.service';
import { ContentCacheService } from '../../src/content/cache/content-cache.service';
import { RetentionService } from '../../src/jobs/retention/retention.service';
import { MediaProcessingService } from '../../src/media/media-processing.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { type AdminSession, createAdminSession } from './utils/admin-helpers';
import { client, MailInbox, registerVerifiedUser, uniqueEmail } from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

interface CatalogCategory {
  slug: string;
  kind: string;
  products: {
    id: string;
    fromPriceCents: number;
    flavours: unknown[];
    variants: unknown[];
    image: unknown;
    whatsappUrl: string | null;
  }[];
}

/** Bascule le drapeau CATERING_ONLINE_ORDERING (lu au démarrage) sur les services concernés. */
function setOnlineOrdering(app: INestApplication<App>, enabled: boolean): void {
  for (const service of [app.get(CateringRequestsService), app.get(CateringSlotsService)]) {
    (service as unknown as { onlineOrdering: boolean }).onlineOrdering = enabled;
  }
}

describe('Traiteur (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: AdminSession;
  let adminEmail: string;
  const inbox = new MailInbox();
  const unique = Date.now().toString(36);
  const eventDate = addDays(parisToday(new Date()), 10);

  let platterCategoryId: string;
  let cakeCategoryId: string;
  let platterId: string;
  let platterVariantId: string;
  let cakeId: string;
  let bentoVariantId: string;
  let bigCakeVariantId: string;
  const flavourIds: string[] = [];
  let imageId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const storage = app.get(StorageService);
    await storage.ensureBuckets();
    admin = await createAdminSession(app);
    adminEmail = (await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).email;

    await prisma.appSetting.upsert({
      where: { key: 'site.whatsapp_number' },
      update: { value: '+33 6 12 34 56 78' },
      create: { key: 'site.whatsapp_number', value: '+33 6 12 34 56 78' },
    });
    await app.get(ContentCacheService).changed(['catering']);

    const photo = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#E9CDB8' },
    })
      .jpeg()
      .toBuffer();
    const media = await admin.http
      .post('/admin/media', admin.accessToken)
      .attach('file', photo, { filename: 'plateau.jpg', contentType: 'image/jpeg' })
      .expect(201);
    imageId = media.body.id as string;
    await new MediaProcessingService(prisma, storage, app.get(AppConfigService)).process(imageId);
  });

  afterAll(async () => {
    setOnlineOrdering(app, false);
    await inbox.close();
    await app.close();
  });

  const pub = () => client(app);

  describe('catalogue (administration → public)', () => {
    it('refuse l’administration du catalogue à une cliente (403) et à un anonyme (401)', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      await cliente.http.get('/admin/catering/categories', cliente.accessToken).expect(403);
      await pub().get('/admin/catering/categories').expect(401);
      await pub().get('/admin/catering-requests').expect(401);
    });

    it('crée catégories, parfums et produits avec variantes, parfums et photo', async () => {
      const platters = await admin.http
        .post('/admin/catering/categories', admin.accessToken)
        .send({ name: `Plateaux ${unique}`, kind: 'platter' })
        .expect(201);
      platterCategoryId = platters.body.id as string;
      expect(platters.body.slug).toBe(`plateaux-${unique}`);
      const cakes = await admin.http
        .post('/admin/catering/categories', admin.accessToken)
        .send({ name: `Layer cakes ${unique}`, kind: 'layer_cake' })
        .expect(201);
      cakeCategoryId = cakes.body.id as string;

      for (const name of ['Mangue-passion', 'Vanille', 'Fraise']) {
        const flavour = await admin.http
          .post('/admin/catering/flavours', admin.accessToken)
          .send({ name: `${name} ${unique}` })
          .expect(201);
        flavourIds.push(flavour.body.id as string);
      }

      const platter = await admin.http
        .post('/admin/catering/products', admin.accessToken)
        .send({
          categoryId: platterCategoryId,
          name: `Plateau découverte ${unique}`,
          description: 'Vingt pièces salées à partager.',
          composition: [
            { label: 'mini burgers', quantity: 5 },
            { label: 'mini hot-dogs', quantity: 5 },
          ],
          variants: [{ label: 'Plateau de 20 pièces', priceCents: 4_000 }],
          images: [{ mediaId: imageId, alt: 'Plateau de mini burgers' }],
        })
        .expect(201);
      platterId = platter.body.id as string;
      platterVariantId = platter.body.variants[0].id as string;
      expect(platter.body.images[0].previewUrl).toMatch(/^http/);

      const cake = await admin.http
        .post('/admin/catering/products', admin.accessToken)
        .send({
          categoryId: cakeCategoryId,
          name: `Layer cake ${unique}`,
          maxFlavours: 2,
          flavourIds,
          variants: [
            { label: 'Bento', priceCents: 1_500 },
            { label: '6–8 parts', priceCents: 5_000, servingsMin: 6, servingsMax: 8 },
          ],
        })
        .expect(201);
      cakeId = cake.body.id as string;
      bentoVariantId = cake.body.variants[0].id as string;
      bigCakeVariantId = cake.body.variants[1].id as string;
    });

    it('refuse des parts incohérentes, une image inconnue et un slug déjà pris', async () => {
      const base = { categoryId: cakeCategoryId, name: `Gâteau test ${unique}` };
      await admin.http
        .post('/admin/catering/products', admin.accessToken)
        .send({
          ...base,
          variants: [{ label: 'X', priceCents: 100, servingsMin: 8, servingsMax: 6 }],
        })
        .expect(400);
      await admin.http
        .post('/admin/catering/products', admin.accessToken)
        .send({
          ...base,
          variants: [{ label: 'X', priceCents: 100 }],
          images: [{ mediaId: '01900000-0000-7000-8000-000000000000' }],
        })
        .expect(400);
      await admin.http
        .post('/admin/catering/products', admin.accessToken)
        .send({
          ...base,
          slug: `plateau-decouverte-${unique}`,
          variants: [{ label: 'X', priceCents: 100 }],
        })
        .expect(409);
      await admin.http
        .post('/admin/catering/products', admin.accessToken)
        .send({ ...base, variants: [{ label: 'X', priceCents: -1 }] })
        .expect(400);
    });

    it('publie le catalogue : prix serveur, photo, parfums, lien WhatsApp et conditions', async () => {
      const res = await pub().get('/catering/catalog').expect(200);
      expect(res.headers['cache-control']).toContain('s-maxage=300');
      const categories = res.body.categories as CatalogCategory[];
      const platters = categories.find((category) => category.slug === `plateaux-${unique}`)!;
      expect(platters.kind).toBe('platter');
      const card = platters.products[0]!;
      expect(card).toMatchObject({
        name: `Plateau découverte ${unique}`,
        fromPriceCents: 4_000,
        composition: [
          { label: 'mini burgers', quantity: 5 },
          { label: 'mini hot-dogs', quantity: 5 },
        ],
        flavours: [],
      });
      expect(card.image).toMatchObject({ alt: 'Plateau de mini burgers', width: 900, height: 600 });
      expect(card.whatsappUrl).toMatch(/^https:\/\/wa\.me\/33612345678\?text=/);

      const cakes = categories.find((category) => category.slug === `layer-cakes-${unique}`)!;
      expect(cakes.products[0]!.fromPriceCents).toBe(1_500);
      expect(cakes.products[0]!.flavours).toHaveLength(3);

      expect(res.body.conditions).toMatchObject({
        deposit: { thresholdCents: 5_000, belowCents: 1_000, fromCents: 2_000 },
        onlineOrdering: false,
      });
      expect(res.body.conditions.items[0]).toBe(
        'Un acompte de 10,00 € est demandé pour une commande de moins de 50,00 €, de 20,00 € à partir de 50,00 €.',
      );
      expect(res.body.conditions.items).toContain(
        'L’acompte n’est pas remboursable en cas d’annulation de votre part.',
      );
    });

    it('fiche détail avec données structurées Product ; produit masqué introuvable', async () => {
      const res = await pub().get(`/catering/products/layer-cake-${unique}`).expect(200);
      expect(res.body.jsonLd).toMatchObject({
        '@type': 'Product',
        offers: {
          '@type': 'AggregateOffer',
          lowPrice: '15.00',
          highPrice: '50.00',
          priceCurrency: 'EUR',
        },
      });
      expect(res.body.category.kind).toBe('layer_cake');

      await admin.http
        .patch(`/admin/catering/products/${platterId}`, admin.accessToken)
        .send({ visible: false })
        .expect(200);
      await pub().get(`/catering/products/plateau-decouverte-${unique}`).expect(404);
      await pub().get('/catering/products/<script>').expect(404);
    });

    it('un changement de prix est visible immédiatement (cache invalidé)', async () => {
      await admin.http
        .patch(`/admin/catering/products/${platterId}`, admin.accessToken)
        .send({
          visible: true,
          variants: [{ id: platterVariantId, label: 'Plateau de 20 pièces', priceCents: 4_200 }],
        })
        .expect(200);
      const res = await pub().get('/catering/catalog').expect(200);
      const card = (res.body.categories as CatalogCategory[])
        .flatMap((category) => category.products)
        .find((product) => product.id === platterId)!;
      expect(card.variants).toEqual([
        expect.objectContaining({ id: platterVariantId, priceCents: 4_200 }),
      ]);
    });
  });

  describe('demande personnalisée (public)', () => {
    let requestId: string;
    let reference: string;
    const email = uniqueEmail('traiteur');

    it('enregistre la demande, calcule le total côté serveur et prévient la cliente et Diani', async () => {
      const res = await pub()
        .post('/catering-requests')
        .send({
          firstName: 'Awa',
          lastName: 'Diallo',
          email,
          phone: '+33 6 00 00 00 01',
          eventDate,
          guestCount: 40,
          fulfilment: 'delivery',
          deliveryAddress: 'Créteil',
          message: 'Anniversaire de ma fille',
          items: [
            { variantId: platterVariantId, quantity: 2 },
            { variantId: bentoVariantId, quantity: 1, flavourIds: [flavourIds[0], flavourIds[1]] },
          ],
        })
        .expect(201);
      expect(res.body.reference).toMatch(/^TR-\d{6}$/);
      expect(res.body.estimatedTotalCents).toBe(2 * 4_200 + 1_500);
      expect(res.body.whatsappUrl).toContain(encodeURIComponent(res.body.reference as string));
      reference = res.body.reference as string;

      const stored = await prisma.cateringRequest.findFirstOrThrow({
        where: { email },
        include: { items: { orderBy: { position: 'asc' } }, events: true },
      });
      requestId = stored.id;
      expect(stored.status).toBe('new');
      expect(stored.items[1]).toMatchObject({
        variantLabel: 'Bento',
        unitPriceCents: 1_500,
        flavours: [`Mangue-passion ${unique}`, `Vanille ${unique}`],
      });
      expect(stored.events).toHaveLength(1);

      const received = await inbox.last(email, 'catering-request-received');
      expect(received.data.reference).toBe(reference);
      expect(received.data.estimatedTotal).toBe('99,00 €');
      expect(await inbox.count(adminEmail, 'catering-request-admin')).toBeGreaterThanOrEqual(1);
    });

    it('ne croit jamais un prix envoyé par le client', async () => {
      await pub()
        .post('/catering-requests')
        .send({
          firstName: 'Awa',
          email: uniqueEmail('traiteur'),
          eventDate,
          items: [{ variantId: platterVariantId, quantity: 1, unitPriceCents: 1 }],
        })
        .expect(400);
    });

    it.each([
      ['une date trop proche', { eventDate: parisToday(new Date()) }, 'eventDate'],
      ['une date inexistante', { eventDate: '2027-02-31' }, 'eventDate'],
      [
        'une date dans plus d’un an',
        { eventDate: addDays(parisToday(new Date()), 400) },
        'eventDate',
      ],
      [
        'une adresse pour un retrait',
        { fulfilment: 'pickup', deliveryAddress: 'Paris' },
        'deliveryAddress',
      ],
      [
        'un produit inconnu',
        { items: [{ variantId: '01900000-0000-7000-8000-000000000000', quantity: 1 }] },
        'items.0.variantId',
      ],
    ])('refuse %s', async (_label, patch, field) => {
      const res = await pub()
        .post('/catering-requests')
        .send({ firstName: 'Awa', email: uniqueEmail('traiteur'), eventDate, ...patch })
        .expect(400);
      expect(res.body.errors[0].field).toBe(field);
    });

    it('refuse trop de parfums, ou un parfum sur un plateau', async () => {
      const tooMany = await pub()
        .post('/catering-requests')
        .send({
          firstName: 'Awa',
          email: uniqueEmail('traiteur'),
          eventDate,
          items: [{ variantId: bentoVariantId, quantity: 1, flavourIds }],
        })
        .expect(400);
      expect(tooMany.body.errors[0].messages[0]).toBe('au plus 2 parfum(s)');
      await pub()
        .post('/catering-requests')
        .send({
          firstName: 'Awa',
          email: uniqueEmail('traiteur'),
          eventDate,
          items: [{ variantId: platterVariantId, quantity: 1, flavourIds: [flavourIds[0]] }],
        })
        .expect(400);
    });

    it('piège à robots : réponse de succès, rien n’est enregistré ni envoyé', async () => {
      const botEmail = uniqueEmail('robot');
      const res = await pub()
        .post('/catering-requests')
        .send({ firstName: 'Bot', email: botEmail, eventDate, website: 'https://spam.example' })
        .expect(201);
      expect(res.body.reference).toBe('TR-000000');
      expect(await prisma.cateringRequest.count({ where: { email: botEmail } })).toBe(0);
      expect(await inbox.count(botEmail, 'catering-request-received')).toBe(0);
    });

    it('limite le débit : 3 envois par 10 minutes et par IP', async () => {
      const same = pub();
      for (let i = 0; i < 3; i += 1) {
        await same
          .post('/catering-requests')
          .send({ firstName: 'Awa', email: uniqueEmail('debit'), eventDate })
          .expect(201);
      }
      await same
        .post('/catering-requests')
        .send({ firstName: 'Awa', email: uniqueEmail('debit'), eventDate })
        .expect(429);
    });

    it('limite les accusés de réception à 3 par jour pour une même adresse (anti-bombardement)', async () => {
      const target = uniqueEmail('cible');
      for (let i = 0; i < 4; i += 1) {
        await pub()
          .post('/catering-requests')
          .send({ firstName: 'Awa', email: target, eventDate })
          .expect(201);
      }
      expect(await prisma.cateringRequest.count({ where: { email: target } })).toBe(4);
      expect(await inbox.count(target, 'catering-request-received')).toBe(3);
    });

    describe('suivi par l’administration', () => {
      it('retrouve la demande par sa référence, son e-mail ou son nom', async () => {
        for (const q of [reference, email, 'diallo']) {
          const res = await admin.http
            .get(`/admin/catering-requests?q=${encodeURIComponent(q)}`, admin.accessToken)
            .expect(200);
          expect((res.body.items as { id: string }[]).map((item) => item.id)).toContain(requestId);
        }
        const detail = await admin.http
          .get(`/admin/catering-requests/${requestId}`, admin.accessToken)
          .expect(200);
        expect(detail.body).toMatchObject({
          reference,
          status: 'new',
          nextStatuses: ['contacted', 'deposit_received', 'cancelled'],
          depositCents: null,
        });
        expect(detail.body.customerWhatsappUrl).toMatch(/^https:\/\/wa\.me\/33600000001/);
      });

      it('refuse de confirmer sans acompte, et d’enregistrer l’acompte sans total convenu', async () => {
        const confirm = await admin.http
          .post(`/admin/catering-requests/${requestId}/status`, admin.accessToken)
          .send({ status: 'confirmed' })
          .expect(409);
        expect(confirm.body.code).toBe('INVALID_STATUS_TRANSITION');
        const deposit = await admin.http
          .post(`/admin/catering-requests/${requestId}/deposit`, admin.accessToken)
          .send({ method: 'Virement' })
          .expect(400);
        expect(deposit.body.errors[0].field).toBe('agreedTotalCents');
      });

      it('marque la demande contactée et fixe le total convenu (aperçu de l’acompte)', async () => {
        await admin.http
          .post(`/admin/catering-requests/${requestId}/status`, admin.accessToken)
          .send({ status: 'contacted' })
          .expect(200);
        const res = await admin.http
          .patch(`/admin/catering-requests/${requestId}`, admin.accessToken)
          .send({ agreedTotalCents: 5_000, internalNotes: 'Préfère être appelée le soir.' })
          .expect(200);
        // 50 € pile → acompte de 20 € (D-041).
        expect(res.body).toMatchObject({
          depositCents: 2_000,
          balanceCents: 3_000,
          depositReceivedAt: null,
        });
      });

      it('enregistre l’acompte calculé (20 € pour 50 €), puis fige le total', async () => {
        const res = await admin.http
          .post(`/admin/catering-requests/${requestId}/deposit`, admin.accessToken)
          .send({ method: 'Virement' })
          .expect(200);
        expect(res.body).toMatchObject({
          status: 'deposit_received',
          agreedTotalCents: 5_000,
          depositCents: 2_000,
          depositMethod: 'Virement',
          nextStatuses: ['confirmed', 'cancelled'],
        });
        expect((res.body.events as { note: string }[]).at(-1)?.note).toBe(
          'Acompte de 20,00 € reçu (Virement)',
        );
        await admin.http
          .patch(`/admin/catering-requests/${requestId}`, admin.accessToken)
          .send({ agreedTotalCents: 6_000 })
          .expect(409);
        await admin.http
          .post(`/admin/catering-requests/${requestId}/deposit`, admin.accessToken)
          .send({ method: 'Espèces' })
          .expect(409);
      });

      it('confirme : e-mail de confirmation avec acompte et solde', async () => {
        await admin.http
          .post(`/admin/catering-requests/${requestId}/status`, admin.accessToken)
          .send({ status: 'confirmed' })
          .expect(200);
        const mail = await inbox.last(email, 'catering-order-confirmed');
        expect(mail.data).toMatchObject({
          reference,
          total: '50,00 €',
          deposit: '20,00 €',
          balance: '30,00 €',
        });
      });

      it('produit un récapitulatif sans note interne', async () => {
        const res = await admin.http
          .get(`/admin/catering-requests/${requestId}/recap`, admin.accessToken)
          .expect(200);
        expect(res.body.text).toContain(`Commande ${reference} — Confirmée`);
        expect(res.body.text).toContain('Acompte : 20,00 € (reçu)');
        expect(res.body.text).toContain('Solde au retrait ou à la livraison : 30,00 €');
        expect(res.body.text).not.toContain('Préfère être appelée');
      });

      it('livrée : plus aucune modification hors notes internes ; historique complet', async () => {
        await admin.http
          .post(`/admin/catering-requests/${requestId}/status`, admin.accessToken)
          .send({ status: 'delivered' })
          .expect(200);
        await admin.http
          .patch(`/admin/catering-requests/${requestId}`, admin.accessToken)
          .send({ guestCount: 50 })
          .expect(409);
        const res = await admin.http
          .patch(`/admin/catering-requests/${requestId}`, admin.accessToken)
          .send({ internalNotes: 'Cliente ravie.' })
          .expect(200);
        expect((res.body.events as { toStatus: string }[]).map((event) => event.toStatus)).toEqual([
          'new',
          'contacted',
          'deposit_received',
          'confirmed',
          'delivered',
        ]);
        const audit = await prisma.auditLog.findMany({
          where: { targetId: requestId },
          select: { action: true },
        });
        expect(audit.map((entry) => entry.action)).toEqual(
          expect.arrayContaining(['catering.request_created', 'catering.deposit_recorded']),
        );
      });

      it('exige un motif pour annuler', async () => {
        const created = await admin.http
          .post('/admin/catering-requests', admin.accessToken)
          .send({
            firstName: 'Mariam',
            email: uniqueEmail('whatsapp'),
            eventDate: parisToday(new Date()),
          })
          .expect(201);
        expect(created.body.source).toBe('admin');
        const id = created.body.id as string;
        await admin.http
          .post(`/admin/catering-requests/${id}/status`, admin.accessToken)
          .send({ status: 'cancelled' })
          .expect(400);
        const res = await admin.http
          .post(`/admin/catering-requests/${id}/status`, admin.accessToken)
          .send({ status: 'cancelled', note: 'Date annulée par la cliente' })
          .expect(200);
        expect(res.body).toMatchObject({
          status: 'cancelled',
          cancellationReason: 'Date annulée par la cliente',
        });
      });
    });

    it('RGPD : la demande figure dans l’export de la cliente, puis est anonymisée après 3 ans', async () => {
      const cliente = await registerVerifiedUser(app, inbox, { email });
      const exported = await cliente.http.get('/me/export', cliente.accessToken).expect(200);
      expect(exported.body.cateringRequests).toEqual(
        expect.arrayContaining([expect.objectContaining({ reference, firstName: 'Awa' })]),
      );

      await prisma.$executeRaw`UPDATE catering_requests SET updated_at = now() - interval '1100 days' WHERE id = ${requestId}::uuid`;
      const report = await new RetentionService(prisma).purge();
      expect(report.cateringRequestsDays).toBeGreaterThanOrEqual(1);
      const anonymized = await prisma.cateringRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      expect(anonymized).toMatchObject({
        firstName: 'Anonyme',
        lastName: null,
        phone: null,
        message: null,
        internalNotes: null,
        email: `anonyme-${requestId}@anonyme.invalid`,
        agreedTotalCents: 5_000,
      });
    });
  });

  describe('commande en ligne (parcours avancé)', () => {
    it('est fermée par défaut (CATERING_ONLINE_ORDERING=false)', async () => {
      const slots = await pub().get('/catering/slots').expect(403);
      expect(slots.body.code).toBe('FEATURE_DISABLED');
      await pub()
        .post('/catering/orders')
        .send({
          firstName: 'Awa',
          email: uniqueEmail('enligne'),
          eventDate,
          slotId: '01900000-0000-7000-8000-000000000000',
          fulfilment: 'pickup',
          items: [{ variantId: bentoVariantId, quantity: 1 }],
        })
        .expect(403);
    });

    it('ouverte : jamais plus de commandes que la capacité du créneau, même simultanées', async () => {
      setOnlineOrdering(app, true);
      const startsAt = new Date(`${eventDate}T10:00:00+01:00`);
      const slot = await admin.http
        .post('/admin/catering/slots', admin.accessToken)
        .send({
          fulfilment: 'pickup',
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + 2 * 3600_000).toISOString(),
          capacity: 1,
        })
        .expect(201);
      const slotId = slot.body.id as string;
      const listed = await pub().get('/catering/slots?fulfilment=pickup').expect(200);
      expect(listed.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: slotId, remaining: 1 })]),
      );

      const order = () =>
        pub()
          .post('/catering/orders')
          .send({
            firstName: 'Awa',
            email: uniqueEmail('enligne'),
            eventDate: parisToday(startsAt),
            slotId,
            fulfilment: 'pickup',
            items: [{ variantId: bigCakeVariantId, quantity: 1, flavourIds: [flavourIds[2]] }],
          });
      const results = await Promise.all([order(), order(), order(), order()]);
      const statuses = results.map((res) => res.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409]);
      expect(results.find((res) => res.status === 409)?.body.code).toBe('SLOT_UNAVAILABLE');

      const stored = await prisma.cateringRequest.findFirstOrThrow({ where: { slotId } });
      // Commande en ligne : total et acompte calculés par le serveur (50 € → 20 €).
      expect(stored).toMatchObject({
        source: 'online',
        agreedTotalCents: 5_000,
        depositCents: 2_000,
        status: 'new',
      });
      const after = await pub().get('/catering/slots?fulfilment=pickup').expect(200);
      expect((after.body as { id: string }[]).map((entry) => entry.id)).not.toContain(slotId);
      await admin.http.delete(`/admin/catering/slots/${slotId}`, admin.accessToken).expect(409);
    });
  });

  describe('administration du catalogue (suite)', () => {
    it('refuse de supprimer une catégorie qui contient des produits', async () => {
      await admin.http
        .delete(`/admin/catering/categories/${platterCategoryId}`, admin.accessToken)
        .expect(409);
    });

    it('supprime un produit (logique) : il disparaît, son slug est libéré, les demandes restent', async () => {
      await admin.http.delete(`/admin/catering/products/${cakeId}`, admin.accessToken).expect(204);
      await pub().get(`/catering/products/layer-cake-${unique}`).expect(404);
      await admin.http
        .post('/admin/catering/products', admin.accessToken)
        .send({
          categoryId: cakeCategoryId,
          name: `Layer cake ${unique}`,
          variants: [{ label: 'Bento', priceCents: 1_600 }],
        })
        .expect(201);
      expect(
        await prisma.cateringRequestItem.count({ where: { productName: `Layer cake ${unique}` } }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('réordonne les produits d’une même catégorie seulement', async () => {
      const second = await admin.http
        .post('/admin/catering/products', admin.accessToken)
        .send({
          categoryId: platterCategoryId,
          name: `Plateau mix gourmand ${unique}`,
          variants: [{ label: 'Plateau de 25 pièces', priceCents: 4_200 }],
        })
        .expect(201);
      const reordered = await admin.http
        .put('/admin/catering/products/order', admin.accessToken)
        .send({ ids: [second.body.id, platterId] })
        .expect(200);
      expect((reordered.body as { id: string }[]).map((product) => product.id)).toEqual([
        second.body.id,
        platterId,
      ]);
      const mixed = await admin.http
        .get(`/admin/catering/products?categoryId=${cakeCategoryId}`, admin.accessToken)
        .expect(200);
      await admin.http
        .put('/admin/catering/products/order', admin.accessToken)
        .send({ ids: [platterId, mixed.body[0].id] })
        .expect(400);
    });

    it('catégories : renommer, masquer (disparaît du public), réordonner, supprimer si vide', async () => {
      const renamed = await admin.http
        .patch(`/admin/catering/categories/${cakeCategoryId}`, admin.accessToken)
        .send({ name: `Gâteaux ${unique}`, visible: false })
        .expect(200);
      expect(renamed.body).toMatchObject({ name: `Gâteaux ${unique}`, visible: false });
      const catalog = await pub().get('/catering/catalog').expect(200);
      expect((catalog.body.categories as { slug: string }[]).map((c) => c.slug)).not.toContain(
        `layer-cakes-${unique}`,
      );
      await admin.http
        .patch(`/admin/catering/categories/${cakeCategoryId}`, admin.accessToken)
        .send({ slug: `plateaux-${unique}` })
        .expect(409);
      await admin.http
        .patch('/admin/catering/categories/01900000-0000-7000-8000-000000000000', admin.accessToken)
        .send({ visible: true })
        .expect(404);

      const empty = await admin.http
        .post('/admin/catering/categories', admin.accessToken)
        .send({ name: `Vide ${unique}`, kind: 'a_la_carte' })
        .expect(201);
      const ordered = await admin.http
        .put('/admin/catering/categories/order', admin.accessToken)
        .send({ ids: [empty.body.id, platterCategoryId, cakeCategoryId] })
        .expect(200);
      const positions = (ordered.body as { id: string; position: number }[]).filter((c) =>
        [empty.body.id, platterCategoryId].includes(c.id),
      );
      expect(positions.map((c) => c.id)).toEqual([empty.body.id, platterCategoryId]);
      await admin.http
        .delete(`/admin/catering/categories/${empty.body.id as string}`, admin.accessToken)
        .expect(204);
      await admin.http
        .delete(`/admin/catering/categories/${empty.body.id as string}`, admin.accessToken)
        .expect(404);
    });

    it('parfums : renommer, masquer, réordonner, supprimer (les demandes gardent le nom)', async () => {
      const masked = await admin.http
        .patch(`/admin/catering/flavours/${flavourIds[1]}`, admin.accessToken)
        .send({ visible: false })
        .expect(200);
      expect(masked.body.visible).toBe(false);
      const catalog = await pub().get('/catering/catalog').expect(200);
      expect((catalog.body.flavours as { id: string }[]).map((f) => f.id)).not.toContain(
        flavourIds[1],
      );
      await admin.http
        .patch(`/admin/catering/flavours/${flavourIds[1]}`, admin.accessToken)
        .send({ slug: `mangue-passion-${unique}` })
        .expect(409);

      const reordered = await admin.http
        .put('/admin/catering/flavours/order', admin.accessToken)
        .send({ ids: [flavourIds[2], flavourIds[0]] })
        .expect(200);
      const ids = (reordered.body as { id: string }[]).map((f) => f.id);
      expect(ids.indexOf(flavourIds[2]!)).toBeLessThan(ids.indexOf(flavourIds[0]!));
      await admin.http
        .put('/admin/catering/flavours/order', admin.accessToken)
        .send({ ids: ['01900000-0000-7000-8000-000000000000'] })
        .expect(400);

      await admin.http
        .delete(`/admin/catering/flavours/${flavourIds[0]}`, admin.accessToken)
        .expect(204);
      await admin.http
        .delete(`/admin/catering/flavours/${flavourIds[0]}`, admin.accessToken)
        .expect(404);
      expect(
        await prisma.cateringRequestItem.count({
          where: { flavours: { has: `Mangue-passion ${unique}` } },
        }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('produits : lecture, variantes réordonnées, variante d’un autre produit refusée', async () => {
      const current = await admin.http
        .get(`/admin/catering/products/${platterId}`, admin.accessToken)
        .expect(200);
      expect(current.body.composition).toHaveLength(2);
      const updated = await admin.http
        .patch(`/admin/catering/products/${platterId}`, admin.accessToken)
        .send({
          variants: [
            { label: 'Plateau de 10 pièces', priceCents: 2_200 },
            { id: platterVariantId, label: 'Plateau de 20 pièces', priceCents: 4_200 },
          ],
          composition: [{ label: 'mini burgers', quantity: 5 }],
          images: [],
        })
        .expect(200);
      expect((updated.body.variants as { label: string }[]).map((v) => v.label)).toEqual([
        'Plateau de 10 pièces',
        'Plateau de 20 pièces',
      ]);
      expect(updated.body.images).toEqual([]);
      await admin.http
        .patch(`/admin/catering/products/${platterId}`, admin.accessToken)
        .send({ variants: [{ id: bentoVariantId, label: 'Volée', priceCents: 1 }] })
        .expect(400);
      await admin.http
        .get('/admin/catering/products/01900000-0000-7000-8000-000000000000', admin.accessToken)
        .expect(404);
    });

    it('créneaux : modification, capacité minimale, désactivation, suppression d’un créneau vide', async () => {
      const startsAt = new Date(`${addDays(eventDate, 1)}T15:00:00+01:00`);
      const slot = await admin.http
        .post('/admin/catering/slots', admin.accessToken)
        .send({
          fulfilment: 'delivery',
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
          capacity: 3,
        })
        .expect(201);
      const id = slot.body.id as string;
      await admin.http
        .patch(`/admin/catering/slots/${id}`, admin.accessToken)
        .send({ endsAt: new Date(startsAt.getTime() - 60_000).toISOString() })
        .expect(400);
      const updated = await admin.http
        .patch(`/admin/catering/slots/${id}`, admin.accessToken)
        .send({ capacity: 5, active: false })
        .expect(200);
      expect(updated.body).toMatchObject({ capacity: 5, active: false, remaining: 5 });
      const listed = await admin.http.get('/admin/catering/slots', admin.accessToken).expect(200);
      expect((listed.body as { id: string }[]).map((s) => s.id)).toContain(id);
      await admin.http.delete(`/admin/catering/slots/${id}`, admin.accessToken).expect(204);
      await admin.http
        .patch(`/admin/catering/slots/${id}`, admin.accessToken)
        .send({ capacity: 2 })
        .expect(404);

      // Créneau qui porte deux commandes : capacité impossible à descendre sous ce nombre.
      const busy = await admin.http
        .post('/admin/catering/slots', admin.accessToken)
        .send({
          fulfilment: 'delivery',
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
          capacity: 3,
        })
        .expect(201);
      for (let i = 0; i < 2; i += 1) {
        await pub()
          .post('/catering/orders')
          .send({
            firstName: 'Awa',
            email: uniqueEmail('enligne'),
            eventDate: parisToday(startsAt),
            slotId: busy.body.id,
            fulfilment: 'delivery',
            deliveryAddress: 'Vitry-sur-Seine',
            items: [{ variantId: platterVariantId, quantity: 1 }],
          })
          .expect(201);
      }
      const refused = await admin.http
        .patch(`/admin/catering/slots/${busy.body.id as string}`, admin.accessToken)
        .send({ capacity: 1 })
        .expect(400);
      expect(refused.body.errors[0].messages[0]).toBe('déjà 2 commande(s) sur ce créneau');
    });

    it('demandes : filtres par statut et par date d’événement', async () => {
      const delivered = await admin.http
        .get('/admin/catering-requests?status=delivered&limit=100', admin.accessToken)
        .expect(200);
      expect(
        (delivered.body.items as { status: string }[]).every((item) => item.status === 'delivered'),
      ).toBe(true);
      const window = await admin.http
        .get(
          `/admin/catering-requests?from=${eventDate}&to=${eventDate}&limit=100`,
          admin.accessToken,
        )
        .expect(200);
      expect(
        (window.body.items as { eventDate: string }[]).every(
          (item) => item.eventDate === eventDate,
        ),
      ).toBe(true);
      const page = await admin.http
        .get('/admin/catering-requests?limit=2', admin.accessToken)
        .expect(200);
      expect(page.body.items).toHaveLength(2);
      const next = await admin.http
        .get(
          `/admin/catering-requests?limit=2&cursor=${page.body.nextCursor as string}`,
          admin.accessToken,
        )
        .expect(200);
      expect(
        (next.body.items as { id: string }[])[0]!.id < (page.body.items as { id: string }[])[1]!.id,
      ).toBe(true);
    });
  });
});
