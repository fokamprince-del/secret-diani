import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  client,
  login,
  MailInbox,
  PASSWORD,
  refresh,
  refreshCookie,
  registerVerifiedUser,
  tokenFromLink,
  uniqueEmail,
} from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

describe('Authentification (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const inbox = new MailInbox();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  describe('inscription', () => {
    it('crée le compte, horodate le consentement et envoie le lien de confirmation', async () => {
      const email = uniqueEmail();
      const res = await client(app)
        .post('/auth/register')
        .send({ email, password: PASSWORD, firstName: 'Awa', acceptTerms: true })
        .expect(202);
      expect(res.body.message).toMatch(/Si cette adresse peut être utilisée/);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.role).toBe('client');
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.termsAcceptedAt).toBeInstanceOf(Date);
      expect(user.termsVersion).toBe('2026-10');
      expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);

      const mail = await inbox.last(email, 'verify-email');
      expect(mail.data.link).toMatch(/^http:\/\/localhost:5173\/verifier-email\?token=/);
    });

    it('réponse identique pour une adresse déjà utilisée (anti-énumération), sans doublon', async () => {
      const email = uniqueEmail();
      const first = await client(app)
        .post('/auth/register')
        .send({ email, password: PASSWORD, acceptTerms: true })
        .expect(202);
      const second = await client(app)
        .post('/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD, acceptTerms: true })
        .expect(202);
      expect(second.body).toEqual(first.body);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      expect(await inbox.count(email, 'account-exists')).toBe(1);
    });

    it('durée de réponse indépendante de l’existence du compte', async () => {
      const email = uniqueEmail();
      await client(app)
        .post('/auth/register')
        .send({ email, password: PASSWORD, acceptTerms: true });
      const time = async (address: string) => {
        const start = Date.now();
        await client(app)
          .post('/auth/register')
          .send({ email: address, password: PASSWORD, acceptTerms: true });
        return Date.now() - start;
      };
      const existing = await time(email);
      const fresh = await time(uniqueEmail());
      expect(existing).toBeGreaterThanOrEqual(390);
      expect(fresh).toBeGreaterThanOrEqual(390);
      expect(Math.abs(existing - fresh)).toBeLessThan(250);
    });

    it.each([
      [
        'mot de passe trop court',
        { password: 'court' },
        'password',
        'doit contenir au moins 12 caractères',
      ],
      [
        'mot de passe courant',
        { password: 'password1234' },
        'password',
        'est trop courant ou trop facile à deviner',
      ],
      [
        'CGU non acceptées',
        { acceptTerms: false },
        'acceptTerms',
        'vous devez accepter les conditions générales pour continuer',
      ],
      [
        'e-mail invalide',
        { email: 'pas-un-email' },
        'email',
        'doit être une adresse e-mail valide',
      ],
    ])('refuse : %s', async (_label, override, field, message) => {
      const res = await client(app)
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, acceptTerms: true, ...override })
        .expect(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([{ field, messages: expect.arrayContaining([message]) }]),
      );
    });

    it('refuse un mot de passe contenant l’adresse e-mail', async () => {
      const email = uniqueEmail('patissiere');
      const local = email.split('@')[0]!;
      const res = await client(app)
        .post('/auth/register')
        .send({ email, password: `${local}-2026!`, acceptTerms: true })
        .expect(400);
      expect(res.body.errors[0].messages).toContain(
        'ne doit pas contenir votre nom ou votre adresse e-mail',
      );
    });

    it('refuse l’affectation d’un rôle (mass assignment)', async () => {
      const res = await client(app)
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: PASSWORD, acceptTerms: true, role: 'admin' })
        .expect(400);
      expect(res.body.errors).toEqual([
        { field: 'role', messages: ['ce champ n’est pas autorisé'] },
      ]);
    });
  });

  describe('confirmation de l’e-mail', () => {
    it('le lien est à usage unique', async () => {
      const email = uniqueEmail();
      const http = client(app);
      await http.post('/auth/register').send({ email, password: PASSWORD, acceptTerms: true });
      const token = tokenFromLink((await inbox.last(email, 'verify-email')).data.link);

      await http.post('/auth/email/verify').send({ token }).expect(200);
      const reuse = await http.post('/auth/email/verify').send({ token }).expect(400);
      expect(reuse.body).toMatchObject({ code: 'INVALID_TOKEN' });
      expect(await inbox.count(email, 'welcome')).toBe(1);
    });

    it('refuse la connexion tant que l’e-mail n’est pas confirmé (message réservé au titulaire)', async () => {
      const email = uniqueEmail();
      const http = client(app);
      await http.post('/auth/register').send({ email, password: PASSWORD, acceptTerms: true });

      const wrong = await http
        .post('/auth/login')
        .send({ email, password: 'Mauvais-mot-de-passe' });
      expect(wrong.status).toBe(401);
      const right = await http.post('/auth/login').send({ email, password: PASSWORD }).expect(403);
      expect(right.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('renvoi limité à 3 e-mails par heure, réponse identique au-delà', async () => {
      const email = uniqueEmail();
      await client(app)
        .post('/auth/register')
        .send({ email, password: PASSWORD, acceptTerms: true });
      const bodies = [];
      for (let i = 0; i < 4; i += 1) {
        const res = await client(app).post('/auth/email/resend').send({ email }).expect(202);
        bodies.push(res.body);
      }
      expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
      // 1 e-mail à l'inscription + 3 renvois autorisés.
      expect(await inbox.count(email, 'verify-email')).toBe(4);
      // Seul le dernier lien est valable.
      const mails = (await inbox.all(email)).filter((mail) => mail.template === 'verify-email');
      const firstToken = tokenFromLink((mails[0]!.data as { link: string }).link);
      await client(app).post('/auth/email/verify').send({ token: firstToken }).expect(400);
    });
  });

  describe('connexion', () => {
    it('renvoie un jeton d’accès court et un cookie HttpOnly; Secure; SameSite=Strict', async () => {
      const email = uniqueEmail();
      const session = await registerVerifiedUser(app, inbox, { email });
      const res = await session.http
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'authenticated',
        expiresIn: 900,
        user: { email, role: 'client', mfaEnabled: false },
      });
      expect(res.body.user.passwordHash).toBeUndefined();
      const cookie = refreshCookie(res);
      expect(cookie?.header).toMatch(/HttpOnly/);
      expect(cookie?.header).toMatch(/Secure/);
      expect(cookie?.header).toMatch(/SameSite=Strict/);
      expect(cookie?.header).toMatch(/Path=\/api\/v1\/auth/);
      expect(JSON.stringify(res.body)).not.toContain(cookie!.value);

      await session.http.get('/me', res.body.accessToken as string).expect(200);
    });

    it('message et code identiques que le compte existe ou non (anti-énumération)', async () => {
      const { email } = await registerVerifiedUser(app, inbox);
      const unknown = await client(app)
        .post('/auth/login')
        .send({ email: uniqueEmail(), password: PASSWORD })
        .expect(401);
      const wrong = await client(app)
        .post('/auth/login')
        .send({ email, password: 'Mauvais-mot-de-passe' })
        .expect(401);
      const strip = (body: Record<string, unknown>) => ({ ...body, requestId: undefined });
      expect(strip(unknown.body as Record<string, unknown>)).toEqual(
        strip(wrong.body as Record<string, unknown>),
      );
      expect(wrong.body).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou mot de passe incorrect.',
      });
    });

    it('accepte l’e-mail quelle que soit la casse', async () => {
      const { email } = await registerVerifiedUser(app, inbox);
      await client(app)
        .post('/auth/login')
        .send({ email: `  ${email.toUpperCase()} `, password: PASSWORD })
        .expect(200);
    });

    it('verrouillage progressif après 5 échecs, même avec le bon mot de passe ensuite', async () => {
      const { email } = await registerVerifiedUser(app, inbox);
      const http = client(app);
      for (let i = 0; i < 5; i += 1) {
        await http
          .post('/auth/login')
          .send({ email, password: `Mauvais-${i}-mot-de-passe` })
          .expect(401);
      }
      const locked = await http.post('/auth/login').send({ email, password: PASSWORD }).expect(429);
      expect(locked.body).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' });
      expect(locked.body.message).toBe('Trop de tentatives. Merci de réessayer dans 1 minute.');

      // Le même verrou s'applique à une adresse inexistante (aucune énumération possible).
      const ghost = uniqueEmail();
      const other = client(app);
      for (let i = 0; i < 5; i += 1) {
        await other.post('/auth/login').send({ email: ghost, password: PASSWORD }).expect(401);
      }
      const ghostLocked = await other
        .post('/auth/login')
        .send({ email: ghost, password: PASSWORD })
        .expect(429);
      expect(ghostLocked.body.message).toBe(locked.body.message);

      // Un autre client (autre IP) n'est pas bloqué : pas de déni de service sur la victime.
      await client(app).post('/auth/login').send({ email, password: PASSWORD }).expect(200);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'auth.login_locked_out' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(JSON.stringify(audit)).not.toContain(email);
    });

    it('limitation de débit par IP sur la route de connexion', async () => {
      const http = client(app);
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await http
          .post('/auth/login')
          .send({ email: uniqueEmail(), password: PASSWORD });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    });

    it('refuse un compte suspendu (message réservé au titulaire)', async () => {
      const session = await registerVerifiedUser(app, inbox);
      await prisma.user.update({ where: { id: session.userId }, data: { status: 'locked' } });
      const res = await client(app)
        .post('/auth/login')
        .send({ email: session.email, password: PASSWORD })
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_LOCKED');
    });
  });

  describe('jeton d’accès et refus par défaut', () => {
    it('toute route non publique exige un jeton', async () => {
      await client(app).get('/me').expect(401);
      await client(app).get('/me/addresses').expect(401);
      await client(app).get('/admin/audit-logs').expect(401);
    });

    it('refuse un jeton altéré', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const [header, payload] = session.accessToken.split('.');
      await session.http.get('/me', `${header}.${payload}.signature-forgee`).expect(401);
    });
  });

  describe('renouvellement (refresh token rotatif)', () => {
    it('renouvelle les jetons et fait tourner le refresh token', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const res = await refresh(session.http, session.refreshToken).expect(200);
      const rotated = refreshCookie(res);
      expect(rotated?.value).toBeDefined();
      expect(rotated?.value).not.toBe(session.refreshToken);
      await session.http.get('/me', res.body.accessToken as string).expect(200);
    });

    it('réutilisation d’un refresh token → toute la famille est révoquée', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const first = await refresh(session.http, session.refreshToken).expect(200);
      const legit = refreshCookie(first)!.value;

      // Un attaquant rejoue l'ancien jeton volé…
      const replay = await refresh(session.http, session.refreshToken).expect(401);
      expect(replay.body.code).toBe('SESSION_EXPIRED');
      // …la session entière est révoquée : le jeton légitime et le jeton d'accès ne marchent plus.
      await refresh(session.http, legit).expect(401);
      await session.http.get('/me', first.body.accessToken as string).expect(401);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'auth.refresh_reuse_detected', actorId: session.userId },
      });
      expect(audit).not.toBeNull();
    });

    it('rotation atomique : deux renouvellements simultanés ne donnent pas deux sessions', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const results = await Promise.all([
        refresh(session.http, session.refreshToken),
        refresh(session.http, session.refreshToken),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([200, 401]);
    });

    it('protection CSRF : en-tête obligatoire et origine vérifiée', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const noHeader = await session.http
        .post('/auth/refresh')
        .set('Cookie', `diani_rt=${session.refreshToken}`)
        .expect(403);
      expect(noHeader.body.code).toBe('CSRF_REJECTED');
      await refresh(session.http, session.refreshToken)
        .set('Origin', 'https://site-malveillant.example')
        .expect(403);
      // Le jeton n'a pas été consommé par les tentatives refusées.
      await refresh(session.http, session.refreshToken)
        .set('Origin', 'http://localhost:5173')
        .expect(200);
    });

    it('sans cookie → 401 et cookie effacé', async () => {
      const res = await client(app).post('/auth/refresh').set('X-CSRF-Token', '1').expect(401);
      expect(String(res.headers['set-cookie'])).toMatch(/diani_rt=;/);
    });
  });

  describe('déconnexion', () => {
    it('révoque la session : refresh et jeton d’accès refusés immédiatement', async () => {
      const session = await registerVerifiedUser(app, inbox);
      await session.http
        .post('/auth/logout')
        .set('Cookie', `diani_rt=${session.refreshToken}`)
        .set('X-CSRF-Token', '1')
        .expect(204);
      await session.http.get('/me', session.accessToken).expect(401);
      await refresh(session.http, session.refreshToken).expect(401);
    });

    it('déconnexion de tous les appareils', async () => {
      const first = await registerVerifiedUser(app, inbox);
      const second = await login(client(app), first.email, PASSWORD);
      await first.http.post('/auth/logout-all', first.accessToken).expect(204);
      await first.http.get('/me', first.accessToken).expect(401);
      await second.http.get('/me', second.accessToken).expect(401);
      await refresh(second.http, second.refreshToken).expect(401);
    });
  });

  describe('mot de passe oublié', () => {
    it('réinitialise avec un lien à usage unique de 30 min et déconnecte toutes les sessions', async () => {
      const session = await registerVerifiedUser(app, inbox, { firstName: 'Awa' });
      const http = client(app);
      const res = await http
        .post('/auth/password/forgot')
        .send({ email: session.email })
        .expect(202);
      expect(res.body.message).toMatch(/Si un compte correspond/);

      const mail = await inbox.last(session.email, 'password-reset');
      expect(mail.data.expiresInMinutes).toBe(30);
      expect(mail.data.code).toMatch(/^\d{6}$/);
      expect(mail.data.codeExpiresInMinutes).toBe(15);
      const token = tokenFromLink(mail.data.link);
      const stored = await prisma.userToken.findFirstOrThrow({
        where: { userId: session.userId, purpose: 'password_reset', usedAt: null },
      });
      expect(stored.tokenHash).not.toBe(token);
      // created_at vient de l'horloge Postgres, expires_at de l'application : tolérance de 2 s.
      const lifetime = stored.expiresAt.getTime() - stored.createdAt.getTime();
      expect(Math.abs(lifetime - 30 * 60_000)).toBeLessThan(2_000);

      const newPassword = 'Nouveau-Mot-De-Passe-Chantilly';
      await http.post('/auth/password/reset').send({ token, password: newPassword }).expect(200);
      await http.post('/auth/password/reset').send({ token, password: newPassword }).expect(400);

      await session.http.get('/me', session.accessToken).expect(401);
      await refresh(session.http, session.refreshToken).expect(401);
      await client(app)
        .post('/auth/login')
        .send({ email: session.email, password: PASSWORD })
        .expect(401);
      await login(client(app), session.email, newPassword);
      expect(await inbox.count(session.email, 'password-changed')).toBe(1);
    });

    it('réponse identique pour une adresse inconnue, sans e-mail envoyé', async () => {
      const email = uniqueEmail();
      const res = await client(app).post('/auth/password/forgot').send({ email }).expect(202);
      expect(res.body.message).toMatch(/Si un compte correspond/);
      expect(await inbox.all(email)).toHaveLength(0);
    });

    it('applique la politique de mot de passe à la réinitialisation', async () => {
      const session = await registerVerifiedUser(app, inbox);
      await client(app).post('/auth/password/forgot').send({ email: session.email });
      const token = tokenFromLink((await inbox.last(session.email, 'password-reset')).data.link);
      const res = await client(app)
        .post('/auth/password/reset')
        .send({ token, password: 'password1234' })
        .expect(400);
      expect(res.body.errors[0].field).toBe('password');
    });
  });

  describe('changement de mot de passe', () => {
    it('exige le mot de passe actuel et déconnecte les autres appareils seulement', async () => {
      const current = await registerVerifiedUser(app, inbox);
      const other = await login(client(app), current.email, PASSWORD);

      const wrong = await current.http
        .post('/auth/password/change', current.accessToken)
        .send({
          currentPassword: 'Mauvais-mot-de-passe',
          newPassword: 'Un-Autre-Mot-De-Passe-2026',
        })
        .expect(400);
      expect(wrong.body.code).toBe('INVALID_PASSWORD');

      await current.http
        .post('/auth/password/change', current.accessToken)
        .send({ currentPassword: PASSWORD, newPassword: 'Un-Autre-Mot-De-Passe-2026' })
        .expect(200);

      await current.http.get('/me', current.accessToken).expect(200);
      await other.http.get('/me', other.accessToken).expect(401);
      await refresh(other.http, other.refreshToken).expect(401);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'auth.password_changed', actorId: current.userId },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('changement d’adresse e-mail', () => {
    it('confirmé depuis la nouvelle adresse, ancienne adresse prévenue, sessions révoquées', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const newEmail = uniqueEmail('nouvelle');
      await session.http
        .post('/auth/email/change', session.accessToken)
        .send({ newEmail, currentPassword: PASSWORD })
        .expect(202);
      expect(await inbox.count(session.email, 'email-change-notice')).toBe(1);

      const token = tokenFromLink((await inbox.last(newEmail, 'email-change-confirm')).data.link);
      await client(app).post('/auth/email/change/confirm').send({ token }).expect(200);

      await session.http.get('/me', session.accessToken).expect(401);
      const relogged = await login(client(app), newEmail, PASSWORD);
      const me = await relogged.http.get('/me', relogged.accessToken).expect(200);
      expect(me.body.email).toBe(newEmail);
    });

    it('refuse à la confirmation une adresse prise entre-temps', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const target = uniqueEmail('cible');
      await session.http
        .post('/auth/email/change', session.accessToken)
        .send({ newEmail: target, currentPassword: PASSWORD })
        .expect(202);
      await registerVerifiedUser(app, inbox, { email: target });
      const token = tokenFromLink((await inbox.last(target, 'email-change-confirm')).data.link);
      const res = await client(app).post('/auth/email/change/confirm').send({ token }).expect(409);
      expect(res.body.message).toMatch(/ne peut pas être utilisée/);
    });
  });
});
