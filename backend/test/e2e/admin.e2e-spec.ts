import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import type { DashboardView } from '../../src/admin/dashboard/dashboard.service';
import { reencryptSecrets } from '../../src/cli/reencrypt-secrets.core';
import { FieldEncryptionService } from '../../src/common/crypto/field-encryption.service';
import type { AppConfigService } from '../../src/config/app-config.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { type AdminSession, createAdminSession } from './utils/admin-helpers';
import {
  client,
  login,
  MailInbox,
  PASSWORD,
  registerVerifiedUser,
  uniqueEmail,
} from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

const TEST_KEY = process.env.FIELD_ENCRYPTION_KEY!;
const NEW_KEY = Buffer.alloc(32, 7).toString('base64');

function encryptionWith(current: string, previous?: string): FieldEncryptionService {
  const env: Record<string, string | undefined> = {
    FIELD_ENCRYPTION_KEY: current,
    FIELD_ENCRYPTION_KEY_PREVIOUS: previous,
  };
  return new FieldEncryptionService({ get: (key: string) => env[key] } as AppConfigService);
}

describe('Administration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: AdminSession;
  const inbox = new MailInbox();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createAdminSession(app);
  });

  afterAll(async () => {
    // Paramètres remis à leur valeur par défaut pour les autres fichiers de test.
    await prisma.appSetting.deleteMany({
      where: { key: { in: ['features.shop_open', 'features.course_sales_open'] } },
    });
    await inbox.close();
    await app.close();
  });

  const pub = () => client(app);

  describe('paramètres du site', () => {
    it('réservés à l’administration', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      await cliente.http.get('/admin/settings', cliente.accessToken).expect(403);
      await pub().get('/admin/settings').expect(401);
      await cliente.http
        .put('/admin/settings/site.contact_email', cliente.accessToken)
        .send({ value: 'pirate@example.com' })
        .expect(403);
    });

    it('liste chaque paramètre avec sa valeur, sa valeur par défaut et son schéma', async () => {
      const res = await admin.http.get('/admin/settings', admin.accessToken).expect(200);
      const deposit = (res.body as { key: string }[]).find(
        (setting) => setting.key === 'catering.deposit_below_cents',
      );
      expect(deposit).toMatchObject({
        group: 'catering',
        groupLabel: 'Traiteur',
        defaultValue: 1_000,
        schema: { type: 'integer' },
      });
      await admin.http.get('/admin/settings/site.inconnu', admin.accessToken).expect(404);
      await admin.http.get('/admin/settings/PAS-UNE-CLE', admin.accessToken).expect(400);
    });

    it('refuse une valeur non conforme, avec le détail en français', async () => {
      const res = await admin.http
        .put('/admin/settings/site.announcement', admin.accessToken)
        .send({ value: { enabled: true, text: '', link: 'javascript:alert(1)' } })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      const fields = (res.body.errors as { field: string }[]).map((error) => error.field);
      expect(fields).toEqual(expect.arrayContaining(['value.link']));
      await admin.http
        .put('/admin/settings/catering.deposit_below_cents', admin.accessToken)
        .send({ value: -5 })
        .expect(400);
      await admin.http
        .put('/admin/settings/catering.deposit_below_cents', admin.accessToken)
        .send({})
        .expect(400);
    });

    it('modifie sans déploiement : effet immédiat sur le site, journalisé, retour au défaut', async () => {
      const before = await pub().get('/site/settings').expect(200);
      expect(before.headers['cache-control']).toContain('s-maxage');
      expect(before.body.announcement).toBeNull();

      const updated = await admin.http
        .put('/admin/settings/site.announcement', admin.accessToken)
        .send({ value: { enabled: true, text: '  Fermé du 1er au 5 août  ', link: '/contact' } })
        .expect(200);
      expect(updated.body).toMatchObject({
        isDefault: false,
        value: { enabled: true, text: 'Fermé du 1er au 5 août', link: '/contact' },
      });
      await admin.http
        .put('/admin/settings/site.contact_email', admin.accessToken)
        .send({ value: 'bonjour@lessecretsdediani.fr' })
        .expect(200);

      // Cache public invalidé : la nouvelle valeur est servie tout de suite.
      const after = await pub().get('/site/settings').expect(200);
      expect(after.body).toMatchObject({
        contactEmail: 'bonjour@lessecretsdediani.fr',
        announcement: { text: 'Fermé du 1er au 5 août', link: '/contact' },
        features: { shopOpen: true, courseSalesOpen: true },
      });
      expect(
        await prisma.auditLog.count({
          where: { action: 'settings.updated', actorId: admin.userId },
        }),
      ).toBeGreaterThanOrEqual(2);

      const reset = await admin.http
        .delete('/admin/settings/site.announcement', admin.accessToken)
        .expect(200);
      expect(reset.body).toMatchObject({ isDefault: true, value: { enabled: false } });
      expect((await pub().get('/site/settings').expect(200)).body.announcement).toBeNull();
      await admin.http.delete('/admin/settings/site.contact_email', admin.accessToken).expect(200);
    });

    it('un prix modifié s’applique au calcul serveur (acompte traiteur)', async () => {
      await admin.http
        .put('/admin/settings/catering.deposit_below_cents', admin.accessToken)
        .send({ value: 1_500 })
        .expect(200);
      const conditions = await pub().get('/catering/conditions').expect(200);
      expect(conditions.body.deposit).toMatchObject({ belowCents: 1_500 });
      expect(conditions.body.items[0]).toContain('15');
      await admin.http
        .delete('/admin/settings/catering.deposit_below_cents', admin.accessToken)
        .expect(200);
    });

    it('fermeture de la boutique et des ventes de formations', async () => {
      await admin.http
        .put('/admin/settings/features.shop_open', admin.accessToken)
        .send({ value: false })
        .expect(200);
      await admin.http
        .put('/admin/settings/features.course_sales_open', admin.accessToken)
        .send({ value: false })
        .expect(200);
      expect((await pub().get('/site/settings').expect(200)).body.features).toEqual({
        shopOpen: false,
        courseSalesOpen: false,
      });

      const shop = await pub()
        .post('/shop/checkout')
        .set('X-CSRF-Token', '1')
        .send({
          email: uniqueEmail('fermee'),
          firstName: 'Awa',
          lastName: 'Diallo',
          shippingRateId: '01900000-0000-7000-8000-000000000000',
          acceptTerms: true,
        })
        .expect(503);
      expect(shop.body.code).toBe('FEATURE_DISABLED');
      expect(shop.body.message).toMatch(/boutique est momentanément fermée/);

      const student = await registerVerifiedUser(app, inbox);
      const pack = await student.http
        .post('/courses/packs/essentiel/checkout', student.accessToken)
        .send({
          billingAddress: {
            firstName: 'Awa',
            lastName: 'Diallo',
            line1: '2 avenue des Roses',
            postalCode: '75011',
            city: 'Paris',
            country: 'FR',
          },
          acceptTerms: true,
        })
        .expect(503);
      expect(pack.body.code).toBe('FEATURE_DISABLED');

      await admin.http.delete('/admin/settings/features.shop_open', admin.accessToken).expect(200);
      await admin.http
        .delete('/admin/settings/features.course_sales_open', admin.accessToken)
        .expect(200);
    });
  });

  describe('gestion des comptes', () => {
    it('recherche et fiche d’un compte, sans secret', async () => {
      const cliente = await registerVerifiedUser(app, inbox, { firstName: 'Mariam' });
      await cliente.http.get('/admin/users', cliente.accessToken).expect(403);

      const found = await admin.http
        .get(`/admin/users?q=${encodeURIComponent(cliente.email.slice(0, 14))}`, admin.accessToken)
        .expect(200);
      expect((found.body.items as { id: string }[]).map((user) => user.id)).toContain(
        cliente.userId,
      );
      const admins = await admin.http
        .get('/admin/users?role=admin&limit=100', admin.accessToken)
        .expect(200);
      expect((admins.body.items as { role: string }[]).every((user) => user.role === 'admin')).toBe(
        true,
      );

      const detail = await admin.http
        .get(`/admin/users/${cliente.userId}`, admin.accessToken)
        .expect(200);
      expect(detail.body).toMatchObject({
        email: cliente.email,
        firstName: 'Mariam',
        role: 'client',
        status: 'active',
        emailVerified: true,
        mfaEnabled: false,
        stats: { orders: 0, activeSessions: 1, activeAccesses: 0 },
        recentOrders: [],
      });
      expect(JSON.stringify(detail.body)).not.toMatch(/passwordHash|totpSecret/);
      await admin.http
        .get('/admin/users/01900000-0000-7000-8000-000000000000', admin.accessToken)
        .expect(404);
    });

    it('suspend (connexion refusée, appareils déconnectés) puis réactive', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      const locked = await admin.http
        .post(`/admin/users/${cliente.userId}/lock`, admin.accessToken)
        .expect(200);
      expect(locked.body).toMatchObject({ status: 'locked', stats: { activeSessions: 0 } });
      expect(locked.body.lockedAt).not.toBeNull();
      await cliente.http.get('/me', cliente.accessToken).expect(401);
      const refused = await client(app)
        .post('/auth/login')
        .send({ email: cliente.email, password: PASSWORD })
        .expect(403);
      expect(refused.body.code).toBe('ACCOUNT_LOCKED');
      expect((await inbox.last(cliente.email, 'account-security-changed')).data.change).toBe(
        'locked',
      );
      await admin.http.post(`/admin/users/${cliente.userId}/lock`, admin.accessToken).expect(409);

      const unlocked = await admin.http
        .post(`/admin/users/${cliente.userId}/unlock`, admin.accessToken)
        .expect(200);
      expect(unlocked.body).toMatchObject({ status: 'active', lockedAt: null });
      await login(client(app), cliente.email, PASSWORD);
      await admin.http.post(`/admin/users/${cliente.userId}/unlock`, admin.accessToken).expect(409);

      const history = await admin.http
        .get(`/admin/audit-logs?targetType=user&targetId=${cliente.userId}`, admin.accessToken)
        .expect(200);
      const actions = (history.body.items as { action: string }[]).map((entry) => entry.action);
      expect(actions).toEqual(expect.arrayContaining(['admin.user_locked', 'admin.user_unlocked']));
    });

    it('lève le verrou anti-force brute à la réactivation', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      // 20 échecs depuis des IP différentes : verrou posé sur l'adresse e-mail elle-même.
      for (let i = 0; i < 21; i++) {
        await client(app)
          .post('/auth/login')
          .send({ email: cliente.email, password: 'Mauvais-123456' });
      }
      await client(app)
        .post('/auth/login')
        .send({ email: cliente.email, password: PASSWORD })
        .expect(429);
      await admin.http.post(`/admin/users/${cliente.userId}/lock`, admin.accessToken).expect(200);
      await admin.http.post(`/admin/users/${cliente.userId}/unlock`, admin.accessToken).expect(200);
      await login(client(app), cliente.email, PASSWORD);
    });

    it('réinitialise la double authentification d’un autre administrateur', async () => {
      const other = await createAdminSession(app);
      const reset = await admin.http
        .post(`/admin/users/${other.userId}/mfa/reset`, admin.accessToken)
        .expect(200);
      expect(reset.body).toMatchObject({ mfaEnabled: false, stats: { activeSessions: 0 } });
      await other.http.get('/me', other.accessToken).expect(401);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: other.userId } });
      expect(row.totpSecretEnc).toBeNull();
      expect(await prisma.mfaBackupCode.count({ where: { userId: other.userId } })).toBe(0);
      await admin.http
        .post(`/admin/users/${other.userId}/mfa/reset`, admin.accessToken)
        .expect(409);

      // Connexion suivante : l'enrôlement est redemandé.
      const relogin = await client(app)
        .post('/auth/login')
        .send({ email: row.email, password: PASSWORD })
        .expect(200);
      expect(relogin.body.status).toBe('mfa_enrollment_required');
      expect(relogin.body.accessToken).toBeUndefined();
    });

    it('déconnecte de tous les appareils et refuse d’agir sur son propre compte', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      const res = await admin.http
        .post(`/admin/users/${cliente.userId}/sessions/revoke`, admin.accessToken)
        .expect(200);
      expect(res.body.revoked).toBe(1);
      await cliente.http.get('/me', cliente.accessToken).expect(401);

      for (const action of ['lock', 'mfa/reset', 'sessions/revoke']) {
        await admin.http
          .post(`/admin/users/${admin.userId}/${action}`, admin.accessToken)
          .expect(403);
      }
      await admin.http.get('/me', admin.accessToken).expect(200);
    });

    it('exporte les données d’un compte (journalisé) ; un compte supprimé est en lecture seule', async () => {
      const cliente = await registerVerifiedUser(app, inbox, { firstName: 'Fatou' });
      const exported = await admin.http
        .get(`/admin/users/${cliente.userId}/export`, admin.accessToken)
        .expect(200);
      expect(exported.headers['content-disposition']).toContain('attachment');
      expect(exported.body.account).toMatchObject({ email: cliente.email, firstName: 'Fatou' });
      expect(
        await prisma.auditLog.count({
          where: { action: 'admin.user_data_exported', targetId: cliente.userId },
        }),
      ).toBe(1);

      await cliente.http
        .delete('/me', cliente.accessToken)
        .send({ password: PASSWORD })
        .expect(204);
      await admin.http.post(`/admin/users/${cliente.userId}/lock`, admin.accessToken).expect(409);
      const hidden = await admin.http
        .get(`/admin/users?q=${cliente.userId.slice(0, 8)}&limit=100`, admin.accessToken)
        .expect(200);
      expect((hidden.body.items as { id: string }[]).map((user) => user.id)).not.toContain(
        cliente.userId,
      );
      const deleted = await admin.http
        .get('/admin/users?status=deleted&limit=100', admin.accessToken)
        .expect(200);
      expect((deleted.body.items as { id: string }[]).map((user) => user.id)).toContain(
        cliente.userId,
      );
    });
  });

  describe('tableau de bord', () => {
    it('ventes du jour, choses à faire et stocks bas', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      await cliente.http.get('/admin/dashboard', cliente.accessToken).expect(403);
      const before = await admin.http.get('/admin/dashboard?days=1', admin.accessToken).expect(200);
      expect(before.body.period.days).toBe(1);
      expect(before.body.sales.daily).toHaveLength(1);

      const order = {
        email: uniqueEmail('tableau'),
        firstName: 'Awa',
        lastName: 'Diallo',
        shippingRateName: 'Colissimo',
        billingAddress: { city: 'Paris' },
        termsAcceptedAt: new Date(),
        termsVersion: '2026-10',
      };
      await prisma.order.create({
        data: {
          ...order,
          status: 'paid',
          shippingMethod: 'delivery',
          shippingAddress: { city: 'Paris' },
          subtotalCents: 3_000,
          shippingCents: 499,
          totalCents: 3_499,
          paidAt: new Date(),
        },
      });
      await prisma.order.create({
        data: {
          ...order,
          status: 'paid',
          shippingMethod: 'digital',
          shippingRateName: 'Numérique',
          subtotalCents: 9_900,
          shippingCents: 0,
          totalCents: 9_900,
          refundedCents: 900,
          paidAt: new Date(),
        },
      });
      await pub()
        .post('/contact')
        .send({
          name: 'Awa',
          email: uniqueEmail('contact'),
          subject: 'general',
          message: 'Bonjour, une question sur les formations.',
        })
        .expect(201);
      const product = await prisma.shopProduct.create({
        data: {
          slug: `kit-tableau-${Date.now()}`,
          name: 'Kit tableau de bord',
          kind: 'kit',
          variants: {
            create: {
              sku: `TB-${Date.now()}`,
              label: 'Standard',
              priceCents: 2_000,
              weightGrams: 500,
              stock: { create: { onHand: 2, reserved: 1, lowStockThreshold: 3 } },
            },
          },
        },
        select: { variants: { select: { id: true } } },
      });

      const after = await admin.http.get('/admin/dashboard?days=1', admin.accessToken).expect(200);
      const delta = (path: (body: DashboardView) => number) =>
        path(after.body as DashboardView) - path(before.body as DashboardView);
      expect(delta((b) => b.sales.orders)).toBe(2);
      expect(delta((b) => b.sales.grossCents)).toBe(13_399);
      expect(delta((b) => b.sales.refundedCents)).toBe(900);
      expect(delta((b) => b.sales.netCents)).toBe(12_499);
      expect(delta((b) => b.sales.shop.grossCents)).toBe(3_499);
      expect(delta((b) => b.sales.courses.orders)).toBe(1);
      expect(delta((b) => b.sales.daily[0]!.grossCents)).toBe(13_399);
      expect(delta((b) => b.todo.ordersToShip)).toBe(1);
      expect(delta((b) => b.todo.contactMessagesNew)).toBe(1);
      expect(delta((b) => b.customers.newAccounts)).toBeGreaterThanOrEqual(0);
      expect(after.body.lowStock).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            variantId: product.variants[0]!.id,
            productName: 'Kit tableau de bord',
            available: 1,
            threshold: 3,
          }),
        ]),
      );

      await admin.http.get('/admin/dashboard?days=0', admin.accessToken).expect(400);
      const month = await admin.http.get('/admin/dashboard', admin.accessToken).expect(200);
      expect(month.body.sales.daily).toHaveLength(30);
    });
  });

  describe('journal d’audit', () => {
    it('filtre par période', async () => {
      const future = new Date(Date.now() + 3_600_000).toISOString();
      const none = await admin.http
        .get(`/admin/audit-logs?from=${future}`, admin.accessToken)
        .expect(200);
      expect(none.body.items).toEqual([]);
      const recent = await admin.http
        .get(`/admin/audit-logs?actorId=${admin.userId}&to=${future}&limit=5`, admin.accessToken)
        .expect(200);
      expect(recent.body.items.length).toBeGreaterThan(0);
      await admin.http.get('/admin/audit-logs?from=hier', admin.accessToken).expect(400);
    });
  });

  describe('rotation de la clé de chiffrement', () => {
    it('rechiffre les secrets 2FA avec la nouvelle clé, puis plus rien à faire', async () => {
      const other = await createAdminSession(app);
      const before = await prisma.user.findUniqueOrThrow({ where: { id: other.userId } });
      const rotated = encryptionWith(NEW_KEY, TEST_KEY);

      const first = await reencryptSecrets(prisma, rotated);
      expect(first.reencrypted).toBeGreaterThanOrEqual(1);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: other.userId } });
      expect(after.totpSecretEnc).not.toBe(before.totpSecretEnc);
      // Lisible avec la seule nouvelle clé, même secret.
      expect(encryptionWith(NEW_KEY).decrypt(after.totpSecretEnc!)).toBe(
        encryptionWith(TEST_KEY).decrypt(before.totpSecretEnc!),
      );
      const second = await reencryptSecrets(prisma, rotated);
      expect(second.reencrypted).toBe(0);
      expect(second.failed).toBe(0);

      // Secret chiffré avec une clé inconnue : signalé, jamais écrasé.
      const unknown = encryptionWith(Buffer.alloc(32, 9).toString('base64')).encrypt('ABC');
      await prisma.user.update({
        where: { id: other.userId },
        data: { totpSecretEnc: unknown },
      });
      expect((await reencryptSecrets(prisma, rotated)).failed).toBe(1);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).totpSecretEnc,
      ).toBe(unknown);

      // Remise en état pour les autres fichiers de test (clé de test courante).
      await prisma.user.update({
        where: { id: other.userId },
        data: { totpSecretEnc: after.totpSecretEnc },
      });
      await reencryptSecrets(prisma, encryptionWith(TEST_KEY, NEW_KEY));
    });
  });
});
