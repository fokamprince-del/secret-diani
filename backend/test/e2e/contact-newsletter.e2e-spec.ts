import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RetentionService } from '../../src/jobs/retention/retention.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { type AdminSession, createAdminSession } from './utils/admin-helpers';
import {
  API,
  client,
  MailInbox,
  PASSWORD,
  registerVerifiedUser,
  tokenFromLink,
  uniqueEmail,
} from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

const MESSAGE = {
  name: 'Awa Diallo',
  phone: '+33612345678',
  subject: 'catering',
  message: 'Bonjour, je voudrais un plateau pour un baptême le mois prochain.',
};

describe('Contact et newsletter (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: AdminSession;
  let adminEmail: string;
  const inbox = new MailInbox();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await createAdminSession(app);
    adminEmail = (await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).email;
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  const pub = () => client(app);

  /** Inscription au formulaire puis confirmation par le lien reçu ; renvoie le lien de désinscription. */
  async function subscribeAndConfirm(email: string): Promise<string> {
    await pub().post('/newsletter/subscribe').send({ email, consent: true }).expect(202);
    const mail = await inbox.last(email, 'newsletter-confirm');
    await pub()
      .post('/newsletter/confirm')
      .send({ token: tokenFromLink(mail.data.confirmLink) })
      .expect(200);
    return mail.data.unsubscribeLink;
  }

  describe('formulaire de contact', () => {
    it('enregistre le message, prévient Diani (réponse directe) et accuse réception', async () => {
      const email = uniqueEmail('contact');
      const res = await pub()
        .post('/contact')
        .send({ ...MESSAGE, email: email.toUpperCase() })
        .expect(201);
      expect(res.body.message).toMatch(/bien reçu/);

      const saved = await prisma.contactMessage.findFirstOrThrow({ where: { email } });
      expect(saved).toMatchObject({ status: 'new', subject: 'catering', phone: '+33612345678' });

      const toAdmin = await inbox.last(adminEmail, 'contact-admin');
      expect(toAdmin.data).toMatchObject({ email, subject: 'Traiteur', name: 'Awa Diallo' });
      const ack = await inbox.last(email, 'contact-ack');
      expect(ack.data).toEqual({ name: 'Awa Diallo', subject: 'Traiteur' });

      // Journal : aucune donnée personnelle.
      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'contact.received', targetId: saved.id },
      });
      expect(JSON.stringify(entry)).not.toContain('@example.com');
    });

    it('piège à robots : même réponse, rien enregistré ni envoyé', async () => {
      const email = uniqueEmail('robot');
      const res = await pub()
        .post('/contact')
        .send({ ...MESSAGE, email, website: 'https://spam.example' })
        .expect(201);
      expect(res.body.message).toMatch(/bien reçu/);
      expect(await prisma.contactMessage.count({ where: { email } })).toBe(0);
      expect(await inbox.count(email, 'contact-ack')).toBe(0);
    });

    it('valide les champs (messages en français) et limite le débit par IP', async () => {
      const http = pub();
      const invalid = await http
        .post('/contact')
        .send({ name: 'A', email: 'pas-un-email', subject: 'inconnu', message: 'court' })
        .expect(400);
      expect(invalid.body.code).toBe('VALIDATION_ERROR');
      const fields = (invalid.body.errors as { field: string }[]).map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'subject', 'message']));

      // Trois messages par tranche de 10 minutes et par IP (requêtes invalides comprises).
      const sender = pub();

      for (let i = 0; i < 3; i++) {
        await sender
          .post('/contact')
          .send({ ...MESSAGE, email: uniqueEmail('debit') })
          .expect(201);
      }
      await sender
        .post('/contact')
        .send({ ...MESSAGE, email: uniqueEmail('debit') })
        .expect(429);
    });

    it('n’envoie pas plus de 3 accusés de réception par jour à une même adresse', async () => {
      const email = uniqueEmail('insistante');
      for (let i = 0; i < 4; i++) {
        await pub()
          .post('/contact')
          .send({ ...MESSAGE, email })
          .expect(201);
      }
      expect(await prisma.contactMessage.count({ where: { email } })).toBe(4);
      expect(await inbox.count(email, 'contact-ack')).toBe(3);
    });

    it('suivi dans l’administration : liste, détail, statut et note interne', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      await cliente.http.get('/admin/contact-messages', cliente.accessToken).expect(403);
      await pub().get('/admin/contact-messages').expect(401);

      const email = uniqueEmail('suivi');
      await pub()
        .post('/contact')
        .send({ ...MESSAGE, email })
        .expect(201);
      const list = await admin.http
        .get('/admin/contact-messages?status=new&limit=100', admin.accessToken)
        .expect(200);
      const item = (list.body.items as { id: string; email: string }[]).find(
        (row) => row.email === email,
      )!;
      expect(item).toBeDefined();

      await admin.http.get(`/admin/contact-messages/${item.id}`, admin.accessToken).expect(200);
      const updated = await admin.http
        .patch(`/admin/contact-messages/${item.id}`, admin.accessToken)
        .send({ status: 'answered', adminNote: 'Devis envoyé par téléphone.' })
        .expect(200);
      expect(updated.body).toMatchObject({
        status: 'answered',
        adminNote: 'Devis envoyé par téléphone.',
      });
      expect(updated.body.handledAt).not.toBeNull();

      await admin.http
        .get('/admin/contact-messages/01900000-0000-7000-8000-000000000000', admin.accessToken)
        .expect(404);
      await admin.http
        .patch(`/admin/contact-messages/${item.id}`, admin.accessToken)
        .send({ status: 'perdu' })
        .expect(400);
    });
  });

  describe('newsletter (double opt-in)', () => {
    it('exige le consentement et une adresse valide', async () => {
      const res = await pub()
        .post('/newsletter/subscribe')
        .send({ email: uniqueEmail('news'), consent: false })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      await pub()
        .post('/newsletter/subscribe')
        .send({ email: 'pas-un-email', consent: true })
        .expect(400);
    });

    it('n’active l’inscription qu’après confirmation, avec la preuve du consentement', async () => {
      const email = uniqueEmail('news');
      const res = await pub()
        .post('/newsletter/subscribe')
        .send({ email, consent: true })
        .expect(202);
      expect(res.body.message).toMatch(/confirmation/);
      const pending = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
      expect(pending).toMatchObject({ status: 'pending', source: 'form', confirmedAt: null });
      expect(pending.consentText).toMatch(/J’accepte de recevoir/);
      expect(pending.requestIpTruncated).toMatch(/\/24$/);

      const mail = await inbox.last(email, 'newsletter-confirm');
      expect(mail.data.confirmLink).toMatch(/^http:\/\/localhost:5173\/newsletter\/confirmer\?/);
      expect(mail.data.oneClickUrl).toMatch(
        /^http:\/\/localhost:3000\/api\/v1\/newsletter\/unsubscribe\/one-click\?token=/,
      );
      const token = tokenFromLink(mail.data.confirmLink);
      await pub().post('/newsletter/confirm').send({ token }).expect(200);

      const confirmed = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.confirmedAt).toBeInstanceOf(Date);
      expect(confirmed.confirmTokenHash).toBeNull();
      expect(await inbox.count(email, 'newsletter-welcome')).toBe(1);

      // Lien à usage unique.
      const again = await pub().post('/newsletter/confirm').send({ token }).expect(400);
      expect(again.body.code).toBe('INVALID_TOKEN');
    });

    it('ne révèle pas si une adresse est déjà inscrite', async () => {
      const email = uniqueEmail('deja');
      await subscribeAndConfirm(email);
      const res = await pub()
        .post('/newsletter/subscribe')
        .send({ email, consent: true })
        .expect(202);
      const fresh = await pub()
        .post('/newsletter/subscribe')
        .send({ email: uniqueEmail('nouvelle'), consent: true })
        .expect(202);
      expect(res.body).toEqual(fresh.body);
      // Aucun nouvel e-mail pour l'adresse déjà confirmée.
      expect(await inbox.count(email, 'newsletter-confirm')).toBe(1);
    });

    it('limite à 3 e-mails de confirmation par jour et ignore le piège à robots', async () => {
      const email = uniqueEmail('bombe');
      for (let i = 0; i < 4; i++) {
        await pub().post('/newsletter/subscribe').send({ email, consent: true }).expect(202);
      }
      expect(await inbox.count(email, 'newsletter-confirm')).toBe(3);

      const robot = uniqueEmail('robot');
      await pub()
        .post('/newsletter/subscribe')
        .send({ email: robot, consent: true, website: 'x' })
        .expect(202);
      expect(await prisma.newsletterSubscriber.count({ where: { email: robot } })).toBe(0);
    });

    it('refuse un lien de confirmation expiré ou inventé', async () => {
      const email = uniqueEmail('expire');
      await pub().post('/newsletter/subscribe').send({ email, consent: true }).expect(202);
      const mail = await inbox.last(email, 'newsletter-confirm');
      await prisma.newsletterSubscriber.update({
        where: { email },
        data: { confirmTokenExpiresAt: new Date(Date.now() - 1000) },
      });
      await pub()
        .post('/newsletter/confirm')
        .send({ token: tokenFromLink(mail.data.confirmLink) })
        .expect(400);
      await pub()
        .post('/newsletter/confirm')
        .send({ token: 'A'.repeat(43) })
        .expect(400);
      await pub().post('/newsletter/confirm').send({ token: 'court' }).expect(400);
    });

    it('désinscrit en un clic depuis le lien, de façon idempotente', async () => {
      const email = uniqueEmail('depart');
      const link = await subscribeAndConfirm(email);
      expect(link).toMatch(/^http:\/\/localhost:5173\/newsletter\/desinscription\?token=/);
      const token = tokenFromLink(link);

      const res = await pub().post('/newsletter/unsubscribe').send({ token }).expect(200);
      expect(res.body.message).toMatch(/désinscrit/);
      const row = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
      expect(row.status).toBe('unsubscribed');
      expect(row.unsubscribedAt).toBeInstanceOf(Date);
      await pub().post('/newsletter/unsubscribe').send({ token }).expect(200);

      // Jeton falsifié : un octet de signature modifié.
      const forged = token.slice(0, -2) + (token.endsWith('AA') ? 'AB' : 'AA');
      const bad = await pub().post('/newsletter/unsubscribe').send({ token: forged }).expect(400);
      expect(bad.body.code).toBe('INVALID_TOKEN');

      // Réinscription possible après désinscription (nouveau double opt-in).
      await subscribeAndConfirm(email);
      expect(
        (await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).status,
      ).toBe('confirmed');
    });

    it('accepte la désinscription « One-Click » de la messagerie (RFC 8058)', async () => {
      const email = uniqueEmail('oneclick');
      await subscribeAndConfirm(email);
      const welcome = await inbox.last(email, 'newsletter-welcome');
      const url = new URL(welcome.data.oneClickUrl!);
      // Les messageries envoient un formulaire sans cookie ni jeton d'accès.
      await request(app.getHttpServer())
        .post(`${url.pathname}${url.search}`)
        .set('X-Forwarded-For', '198.19.250.1')
        .type('form')
        .send('List-Unsubscribe=One-Click')
        .expect(200);
      expect(
        (await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).status,
      ).toBe('unsubscribed');
      expect(url.pathname).toBe(`${API}/newsletter/unsubscribe/one-click`);
    });
  });

  describe('synchronisation avec le compte', () => {
    it('case cochée à l’inscription : abonnée confirmée dès l’adresse vérifiée', async () => {
      const email = uniqueEmail('compte');
      const http = pub();
      await http
        .post('/auth/register')
        .send({ email, password: PASSWORD, acceptTerms: true, marketingConsent: true })
        .expect(202);
      expect(await prisma.newsletterSubscriber.count({ where: { email } })).toBe(0);
      const verify = await inbox.last(email, 'verify-email');
      await http
        .post('/auth/email/verify')
        .send({ token: tokenFromLink(verify.data.link) })
        .expect(200);
      const row = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
      expect(row).toMatchObject({ status: 'confirmed', source: 'account' });
    });

    it('préférence du profil ↔ newsletter, dans les deux sens', async () => {
      const session = await registerVerifiedUser(app, inbox);
      await session.http
        .patch('/me', session.accessToken)
        .send({ marketingConsent: true })
        .expect(200);
      expect(
        (await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: session.email } }))
          .status,
      ).toBe('confirmed');

      await session.http
        .patch('/me', session.accessToken)
        .send({ marketingConsent: false })
        .expect(200);
      expect(
        (await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: session.email } }))
          .status,
      ).toBe('unsubscribed');

      // Désinscription par lien : la préférence du compte est retirée aussi.
      const link = await subscribeAndConfirm(session.email);
      await session.http
        .patch('/me', session.accessToken)
        .send({ marketingConsent: true })
        .expect(200);
      await pub()
        .post('/newsletter/unsubscribe')
        .send({ token: tokenFromLink(link) })
        .expect(200);
      const profile = await session.http.get('/me', session.accessToken).expect(200);
      expect(profile.body.marketingConsent).toBe(false);
    });

    it('RGPD : export puis effacement de la newsletter et des messages avec le compte', async () => {
      const session = await registerVerifiedUser(app, inbox);
      await subscribeAndConfirm(session.email);
      await pub()
        .post('/contact')
        .send({ ...MESSAGE, email: session.email })
        .expect(201);

      const exported = await session.http.get('/me/export', session.accessToken).expect(200);
      expect(exported.body.newsletter).toMatchObject({ status: 'confirmed', source: 'form' });
      expect(exported.body.contactMessages).toHaveLength(1);
      expect(exported.body.contactMessages[0].message).toBe(MESSAGE.message);

      await session.http
        .delete('/me', session.accessToken)
        .send({ password: PASSWORD })
        .expect(204);
      expect(await prisma.newsletterSubscriber.count({ where: { email: session.email } })).toBe(0);
      expect(await prisma.contactMessage.count({ where: { email: session.email } })).toBe(0);
    });
  });

  describe('administration de la newsletter', () => {
    it('liste, exporte en CSV (journalisé) et efface un·e abonné·e', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      await cliente.http.get('/admin/newsletter/subscribers', cliente.accessToken).expect(403);

      const email = uniqueEmail('export');
      await subscribeAndConfirm(email);
      const pendingEmail = uniqueEmail('attente');
      await pub()
        .post('/newsletter/subscribe')
        .send({ email: pendingEmail, consent: true })
        .expect(202);

      const list = await admin.http
        .get('/admin/newsletter/subscribers?status=confirmed&limit=100', admin.accessToken)
        .expect(200);
      const row = (list.body.items as { id: string; email: string }[]).find(
        (item) => item.email === email,
      )!;
      expect(row).toBeDefined();
      expect(JSON.stringify(list.body)).not.toMatch(/confirmTokenHash|IpTruncated/);

      const csv = await admin.http
        .get('/admin/newsletter/subscribers/export', admin.accessToken)
        .expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['cache-control']).toBe('no-store');
      expect(csv.text).toContain('Consentement');
      expect(csv.text).toContain(email);
      expect(csv.text).not.toContain(pendingEmail);
      expect(
        await prisma.auditLog.count({
          where: { action: 'newsletter.exported', actorId: admin.userId },
        }),
      ).toBeGreaterThanOrEqual(1);

      await admin.http
        .delete(`/admin/newsletter/subscribers/${row.id}`, admin.accessToken)
        .expect(204);
      expect(await prisma.newsletterSubscriber.count({ where: { email } })).toBe(0);
      await admin.http
        .delete(`/admin/newsletter/subscribers/${row.id}`, admin.accessToken)
        .expect(404);
    });
  });

  describe('purge des données expirées', () => {
    it('supprime anciens messages, inscriptions jamais confirmées et désinscrit·es anciens', async () => {
      const day = 24 * 3600 * 1000;
      const oldMessage = await prisma.contactMessage.create({
        data: {
          ...MESSAGE,
          subject: 'general',
          email: uniqueEmail('vieux'),
          createdAt: new Date(Date.now() - 400 * day),
          updatedAt: new Date(Date.now() - 400 * day),
        },
      });
      const base = { consentText: 'test', source: 'form' as const };
      const stalePending = await prisma.newsletterSubscriber.create({
        data: {
          ...base,
          email: uniqueEmail('oubli'),
          status: 'pending',
          requestedAt: new Date(Date.now() - 40 * day),
        },
      });
      const oldUnsubscribed = await prisma.newsletterSubscriber.create({
        data: {
          ...base,
          email: uniqueEmail('parti'),
          status: 'unsubscribed',
          requestedAt: new Date(Date.now() - 4 * 365 * day),
          unsubscribedAt: new Date(Date.now() - 4 * 365 * day),
        },
      });
      const kept = await prisma.newsletterSubscriber.create({
        data: {
          ...base,
          email: uniqueEmail('fidele'),
          status: 'confirmed',
          requestedAt: new Date(Date.now() - 4 * 365 * day),
          confirmedAt: new Date(Date.now() - 4 * 365 * day),
        },
      });

      const report = await new RetentionService(prisma).purge();
      expect(report.contactMessagesDays).toBeGreaterThanOrEqual(1);
      expect(report.pendingNewsletterDays).toBeGreaterThanOrEqual(1);
      expect(report.unsubscribedNewsletterDays).toBeGreaterThanOrEqual(1);
      expect(await prisma.contactMessage.count({ where: { id: oldMessage.id } })).toBe(0);
      expect(await prisma.newsletterSubscriber.count({ where: { id: stalePending.id } })).toBe(0);
      expect(await prisma.newsletterSubscriber.count({ where: { id: oldUnsubscribed.id } })).toBe(
        0,
      );
      expect(await prisma.newsletterSubscriber.count({ where: { id: kept.id } })).toBe(1);
    });
  });
});
