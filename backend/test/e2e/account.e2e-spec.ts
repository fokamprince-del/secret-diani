import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { RetentionService } from '../../src/jobs/retention/retention.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  client,
  login,
  MailInbox,
  PASSWORD,
  refresh,
  registerVerifiedUser,
  type Session,
  uniqueEmail,
} from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

const ADDRESS = {
  type: 'shipping',
  firstName: 'Awa',
  lastName: 'Diallo',
  line1: '12 rue des Lilas',
  postalCode: '75011',
  city: 'Paris',
};

describe('Compte, adresses, sessions et RGPD (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const inbox = new MailInbox();
  let alice: Session;
  let bob: Session;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    alice = await registerVerifiedUser(app, inbox, { firstName: 'Alice' });
    bob = await registerVerifiedUser(app, inbox, { firstName: 'Bob' });
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  describe('profil', () => {
    it('lit et modifie le profil, consentement horodaté', async () => {
      const me = await alice.http.get('/me', alice.accessToken).expect(200);
      expect(me.body).toMatchObject({
        email: alice.email,
        firstName: 'Alice',
        emailVerified: true,
        marketingConsent: false,
      });
      expect(me.body.passwordHash).toBeUndefined();

      const updated = await alice.http
        .patch('/me', alice.accessToken)
        .send({ lastName: 'Martin', phone: '+33 6 12 34 56 78', marketingConsent: true })
        .expect(200);
      expect(updated.body).toMatchObject({ lastName: 'Martin', marketingConsent: true });
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: alice.userId } });
      expect(stored.marketingConsentAt).toBeInstanceOf(Date);

      const cleared = await alice.http
        .patch('/me', alice.accessToken)
        .send({ phone: '', marketingConsent: false })
        .expect(200);
      expect(cleared.body).toMatchObject({ phone: null, marketingConsent: false });

      // Le journal d'audit ne cite que les champs réellement modifiés.
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'account.profile_updated', actorId: alice.userId },
        orderBy: { id: 'desc' },
      });
      expect(entry.metadata).toEqual({ fields: 'marketingConsent,phone' });
    });

    it('refuse la modification des champs protégés (rôle, e-mail)', async () => {
      await alice.http.patch('/me', alice.accessToken).send({ role: 'admin' }).expect(400);
      await alice.http.patch('/me', alice.accessToken).send({ email: 'x@example.com' }).expect(400);
      await alice.http.patch('/me', alice.accessToken).send({ phone: '<script>' }).expect(400);
    });
  });

  describe('adresses et anti-IDOR', () => {
    it('gère le carnet d’adresses avec une seule adresse par défaut par type', async () => {
      const first = await alice.http
        .post('/me/addresses', alice.accessToken)
        .send({ ...ADDRESS, isDefault: true })
        .expect(201);
      expect(first.body).toMatchObject({ country: 'FR', isDefault: true });
      const second = await alice.http
        .post('/me/addresses', alice.accessToken)
        .send({ ...ADDRESS, line1: '3 place du Marché', country: 'be', isDefault: true })
        .expect(201);
      expect(second.body.country).toBe('BE');

      const list = await alice.http.get('/me/addresses', alice.accessToken).expect(200);
      expect(list.body).toHaveLength(2);
      expect((list.body as { isDefault: boolean }[]).filter((a) => a.isDefault)).toHaveLength(1);
      expect(list.body[0].id).toBe(second.body.id);

      const patched = await alice.http
        .patch(`/me/addresses/${first.body.id as string}`, alice.accessToken)
        .send({ city: 'Lyon', postalCode: '69001' })
        .expect(200);
      expect(patched.body).toMatchObject({ city: 'Lyon', isDefault: false });
    });

    it('B ne peut ni lire, ni modifier, ni supprimer l’adresse de A (404)', async () => {
      const own = await alice.http
        .post('/me/addresses', alice.accessToken)
        .send(ADDRESS)
        .expect(201);
      const id = own.body.id as string;

      const bobList = await bob.http.get('/me/addresses', bob.accessToken).expect(200);
      expect((bobList.body as { id: string }[]).map((a) => a.id)).not.toContain(id);
      const patch = await bob.http
        .patch(`/me/addresses/${id}`, bob.accessToken)
        .send({ city: 'Piratage' })
        .expect(404);
      expect(patch.body.message).toBe('Adresse introuvable.');
      await bob.http.delete(`/me/addresses/${id}`, bob.accessToken).expect(404);

      const intact = await prisma.address.findUniqueOrThrow({ where: { id } });
      expect(intact.city).toBe('Paris');
      await alice.http.delete(`/me/addresses/${id}`, alice.accessToken).expect(204);
      await alice.http.delete(`/me/addresses/${id}`, alice.accessToken).expect(404);
    });

    it('valide les adresses et les identifiants', async () => {
      const res = await alice.http
        .post('/me/addresses', alice.accessToken)
        .send({ ...ADDRESS, type: 'domicile', country: 'France', postalCode: '<b>' })
        .expect(400);
      expect((res.body.errors as { field: string }[]).map((e) => e.field).sort()).toEqual([
        'country',
        'postalCode',
        'type',
      ]);
      await alice.http.patch('/me/addresses/pas-un-uuid', alice.accessToken).send({}).expect(400);
    });
  });

  describe('sessions (appareils connectés)', () => {
    it('liste les sessions, signale la courante, et révoque un autre appareil', async () => {
      const email = uniqueEmail();
      const laptop = await registerVerifiedUser(app, inbox, { email });
      const phone = await login(client(app), email, PASSWORD);

      const list = await laptop.http.get('/me/sessions', laptop.accessToken).expect(200);
      expect(list.body).toHaveLength(2);
      const sessions = list.body as { id: string; current: boolean; ipTruncated: string }[];
      const current = sessions.find((s) => s.current)!;
      const other = sessions.find((s) => !s.current)!;
      expect(current.ipTruncated).toMatch(/\.0\/24$/);
      expect(JSON.stringify(list.body)).not.toContain(laptop.http.ip);

      await laptop.http.delete(`/me/sessions/${other.id}`, laptop.accessToken).expect(204);
      await phone.http.get('/me', phone.accessToken).expect(401);
      await refresh(phone.http, phone.refreshToken).expect(401);
      await laptop.http.get('/me', laptop.accessToken).expect(200);
    });

    it('B ne peut pas révoquer une session de A (404)', async () => {
      const aliceSessions = await alice.http.get('/me/sessions', alice.accessToken).expect(200);
      const target = aliceSessions.body[0].id as string;
      await bob.http.delete(`/me/sessions/${target}`, bob.accessToken).expect(404);
      await alice.http.get('/me', alice.accessToken).expect(200);
    });
  });

  describe('RGPD', () => {
    it('exporte toutes les données du compte (sans secret)', async () => {
      const res = await alice.http.get('/me/export', alice.accessToken).expect(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.account).toMatchObject({ email: alice.email, firstName: 'Alice' });
      expect(res.body.consents.termsVersion).toBe('2026-10');
      expect(res.body.addresses.length).toBeGreaterThanOrEqual(1);
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
      expect((res.body.securityEvents as { action: string }[]).map((e) => e.action)).toContain(
        'auth.registered',
      );
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/passwordHash|argon2|totpSecret|tokenHash/);
    });

    it('supprime le compte : mot de passe exigé, anonymisation, sessions révoquées', async () => {
      const session = await registerVerifiedUser(app, inbox, { firstName: 'Zoé' });
      await session.http.post('/me/addresses', session.accessToken).send(ADDRESS).expect(201);

      const wrong = await session.http
        .delete('/me', session.accessToken)
        .send({ password: 'Mauvais-mot-de-passe' })
        .expect(400);
      expect(wrong.body.code).toBe('INVALID_PASSWORD');

      await session.http
        .delete('/me', session.accessToken)
        .send({ password: PASSWORD })
        .expect(204);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
      expect(user).toMatchObject({
        status: 'deleted',
        passwordHash: null,
        firstName: null,
        email: `supprime-${session.userId}@anonyme.invalid`,
      });
      expect(user.deletedAt).toBeInstanceOf(Date);
      expect(await prisma.address.count({ where: { userId: session.userId } })).toBe(0);
      expect(await prisma.session.count({ where: { userId: session.userId } })).toBe(0);

      await session.http.get('/me', session.accessToken).expect(401);
      await refresh(session.http, session.refreshToken).expect(401);
      await client(app)
        .post('/auth/login')
        .send({ email: session.email, password: PASSWORD })
        .expect(401);
      expect(await inbox.count(session.email, 'account-deleted')).toBe(1);

      // L'adresse e-mail est de nouveau disponible.
      await registerVerifiedUser(app, inbox, { email: session.email });
    });
  });

  describe('journal d’audit immuable', () => {
    it('la base refuse toute modification et toute suppression récente', async () => {
      const entry = await prisma.auditLog.findFirstOrThrow();
      await expect(
        prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'falsifie' } }),
      ).rejects.toThrow(/immuable/);
      await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(
        /conservation/,
      );
      // Refusé deux fois : privilège TRUNCATE non accordé au rôle de l'API, puis déclencheur.
      await expect(prisma.$executeRaw`TRUNCATE audit_logs`).rejects.toThrow(
        /permission denied|immuable/,
      );
    });
    it('le rôle de l’API ne peut ni désactiver les déclencheurs ni modifier le schéma', async () => {
      const [role] = await prisma.$queryRaw<{ rolsuper: boolean; owner: boolean }[]>`
        SELECT r.rolsuper, t.tableowner = current_user AS owner
        FROM pg_roles r, pg_tables t
        WHERE r.rolname = current_user AND t.tablename = 'audit_logs'`;
      expect(role).toEqual({ rolsuper: false, owner: false });
      await expect(
        prisma.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_immutable`,
      ).rejects.toThrow(/must be owner/);
      await expect(
        prisma.$executeRaw`DROP TRIGGER audit_logs_immutable ON audit_logs`,
      ).rejects.toThrow(/must be owner/);
      await expect(prisma.$executeRaw`CREATE TABLE intrusion (id int)`).rejects.toThrow(
        /permission denied/,
      );
    });
    it('ne contient aucune adresse e-mail ni IP complète', async () => {
      const entries = await prisma.auditLog.findMany({ take: 500 });
      const serialized = JSON.stringify(entries);
      expect(serialized).not.toContain('@example.com');
      expect(serialized).not.toMatch(/198\.18\.\d+\.\d+(?!\/)\b(?!\/24)/);
      for (const entry of entries) {
        if (entry.ipTruncated) expect(entry.ipTruncated).toMatch(/\/(24|48)$/);
      }
    });
  });

  describe('purge des données expirées', () => {
    it('supprime jetons, sessions et comptes non confirmés hors durée de conservation', async () => {
      const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
      const stale = await prisma.user.create({
        data: {
          email: uniqueEmail('jamais-confirme'),
          passwordHash: 'x',
          termsAcceptedAt: old,
          termsVersion: '2026-10',
          createdAt: old,
        },
      });
      const fresh = await registerVerifiedUser(app, inbox);
      await prisma.session.updateMany({
        where: { userId: fresh.userId },
        data: { revokedAt: old, createdAt: new Date(old.getTime() - 1000) },
      });

      // Service du worker, exécuté ici directement contre la base de test.
      const report = await new RetentionService(prisma).purge();
      expect(report.unverifiedAccountsDays).toBeGreaterThanOrEqual(1);
      expect(report.sessionsDays).toBeGreaterThanOrEqual(1);
      expect(await prisma.user.findUnique({ where: { id: stale.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: fresh.userId } })).not.toBeNull();
      expect(await prisma.session.count({ where: { userId: fresh.userId } })).toBe(0);
      // Le journal récent n'est pas purgé.
      expect(report.auditLogsDays).toBe(0);
    });
  });
});
