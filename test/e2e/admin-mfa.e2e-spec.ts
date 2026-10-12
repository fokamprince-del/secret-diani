import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { totp } from '../../src/auth/mfa/totp';
import { AccessTokenService } from '../../src/auth/tokens/access-token.service';
import { createAdmin } from '../../src/cli/create-admin.core';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  type Client,
  client,
  MailInbox,
  PASSWORD,
  refresh,
  refreshCookie,
  registerVerifiedUser,
  uniqueEmail,
} from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

/** Code TOTP décalé d'un pas (fenêtre de tolérance ±1) : des codes successifs et distincts. */
const code = (secret: string, stepOffset: number) => totp(secret, Date.now() + stepOffset * 30_000);

describe('Administration : 2FA obligatoire et RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const inbox = new MailInbox();

  const adminEmail = uniqueEmail('admin');
  let secret = '';
  let backupCodes: string[] = [];
  let adminToken = '';

  async function startLogin(http: Client): Promise<string> {
    const res = await http
      .post('/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    expect(res.body.status).toBe('mfa_required');
    expect(res.body.accessToken).toBeUndefined();
    expect(refreshCookie(res)).toBeNull();
    return res.body.mfaToken as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  describe('création par la commande CLI', () => {
    it('refuse un mot de passe faible ou une adresse invalide', async () => {
      const result = await createAdmin(prisma, {
        email: 'pas-une-adresse',
        password: 'password1234',
        termsVersion: 'admin',
      });
      expect(result).toEqual({
        ok: false,
        errors: [
          'Adresse e-mail invalide.',
          'Le mot de passe est trop courant ou trop facile à deviner.',
        ],
      });
    });

    it('crée l’administrateur (e-mail vérifié, sans 2FA encore) et l’audite', async () => {
      const result = await createAdmin(prisma, {
        email: adminEmail,
        password: PASSWORD,
        firstName: 'Diani',
        termsVersion: 'admin',
      });
      expect(result.ok).toBe(true);
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
      expect(admin).toMatchObject({ role: 'admin', totpEnabledAt: null });
      expect(admin.emailVerifiedAt).not.toBeNull();
      expect(
        await prisma.auditLog.count({ where: { action: 'admin.created', targetId: admin.id } }),
      ).toBe(1);
    });

    it('ne promeut jamais un compte existant', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const result = await createAdmin(prisma, {
        email: session.email,
        password: PASSWORD,
        termsVersion: 'admin',
      });
      expect(result).toEqual({ ok: false, errors: ['Un compte existe déjà avec cette adresse.'] });
    });
  });

  describe('première connexion : enrôlement TOTP imposé', () => {
    it('le mot de passe seul ne donne aucune session', async () => {
      const http = client(app);
      const res = await http
        .post('/auth/login')
        .send({ email: adminEmail, password: PASSWORD })
        .expect(200);
      expect(res.body).toEqual({ status: 'mfa_enrollment_required', mfaToken: expect.any(String) });
      expect(refreshCookie(res)).toBeNull();
      // Le jeton de défi n'est pas un jeton d'accès.
      await http.get('/admin/audit-logs', res.body.mfaToken as string).expect(401);
    });

    it('enrôle le second facteur, remet 10 codes de secours et ouvre une session courte', async () => {
      const http = client(app);
      const login = await http.post('/auth/login').send({ email: adminEmail, password: PASSWORD });
      const mfaToken = login.body.mfaToken as string;

      // Confirmer avant d'avoir généré le secret est refusé.
      await http.post('/auth/2fa/enroll/confirm').send({ mfaToken, code: '000000' }).expect(401);

      const enroll = await http.post('/auth/2fa/enroll').send({ mfaToken }).expect(200);
      secret = enroll.body.secret as string;
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(enroll.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Les%20Secrets%20de%20Diani/);
      expect(enroll.body.otpauthUrl).not.toContain(encodeURIComponent(adminEmail));

      const wrong = await http
        .post('/auth/2fa/enroll/confirm')
        .send({ mfaToken, code: code(secret, 5) })
        .expect(401);
      expect(wrong.body.code).toBe('MFA_INVALID');

      const confirmed = await http
        .post('/auth/2fa/enroll/confirm')
        .send({ mfaToken, code: code(secret, -1) })
        .expect(200);
      backupCodes = confirmed.body.backupCodes as string[];
      adminToken = confirmed.body.accessToken as string;
      expect(backupCodes).toHaveLength(10);
      expect(new Set(backupCodes).size).toBe(10);
      expect(confirmed.body).toMatchObject({
        status: 'authenticated',
        expiresIn: 600,
        user: { role: 'admin', mfaEnabled: true },
      });

      // Session admin : refresh token valable 1 h au plus.
      const cookie = refreshCookie(confirmed)!;
      const expires = new Date(/Expires=([^;]+)/.exec(cookie.header)![1]!).getTime();
      expect(expires - Date.now()).toBeLessThanOrEqual(60 * 60_000);

      // Secret chiffré au repos, codes de secours hachés.
      const stored = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
      expect(stored.totpSecretEnc).toMatch(/^v1:/);
      expect(stored.totpSecretEnc).not.toContain(secret);
      const hashes = await prisma.mfaBackupCode.findMany({ where: { userId: stored.id } });
      expect(hashes).toHaveLength(10);
      expect(hashes.map((row) => row.codeHash)).not.toContain(backupCodes[0]);

      expect(await inbox.count(adminEmail, 'admin-login-alert')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('connexions suivantes', () => {
    it('exige un code TOTP et refuse son rejeu', async () => {
      const http = client(app);
      const current = code(secret, 0);
      const first = await startLogin(http);
      const ok = await http
        .post('/auth/2fa/verify')
        .send({ mfaToken: first, code: current })
        .expect(200);
      expect(ok.body.user.role).toBe('admin');

      const second = await startLogin(client(app));
      const replay = await client(app)
        .post('/auth/2fa/verify')
        .send({ mfaToken: second, code: current })
        .expect(401);
      expect(replay.body.code).toBe('MFA_INVALID');
    });

    it('accepte un code de secours une seule fois', async () => {
      const backup = backupCodes[0]!.toUpperCase();
      const first = await startLogin(client(app));
      await client(app)
        .post('/auth/2fa/verify')
        .send({ mfaToken: first, backupCode: backup })
        .expect(200);

      const second = await startLogin(client(app));
      await client(app)
        .post('/auth/2fa/verify')
        .send({ mfaToken: second, backupCode: backup })
        .expect(401);
      expect(await prisma.auditLog.count({ where: { action: 'auth.mfa_backup_code_used' } })).toBe(
        1,
      );
    });

    it('exige soit un code, soit un code de secours', async () => {
      const mfaToken = await startLogin(client(app));
      const res = await client(app).post('/auth/2fa/verify').send({ mfaToken }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('détruit le défi après 5 codes invalides', async () => {
      const http = client(app);
      const mfaToken = await startLogin(http);
      const messages: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const res = await http
          .post('/auth/2fa/verify')
          .send({ mfaToken, code: '000000' })
          .expect(401);
        messages.push(res.body.message as string);
      }
      expect(messages.at(-1)).toBe('Trop de codes invalides. Merci de vous reconnecter.');
      const expired = await http
        .post('/auth/2fa/verify')
        .send({ mfaToken, code: code(secret, 1) })
        .expect(401);
      expect(expired.body.message).toBe('Votre vérification a expiré. Merci de vous reconnecter.');
    });

    it('le refresh conserve le second facteur', async () => {
      const http = client(app);
      const mfaToken = await startLogin(http);
      await prisma.user.update({ where: { email: adminEmail }, data: { totpLastStep: null } });
      const verified = await http
        .post('/auth/2fa/verify')
        .send({ mfaToken, code: code(secret, 0) })
        .expect(200);
      const renewed = await refresh(http, refreshCookie(verified)!.value).expect(200);
      expect(renewed.body.expiresIn).toBe(600);
      await http.get('/admin/audit-logs', renewed.body.accessToken as string).expect(200);
    });

    it('remplace les codes de secours (code TOTP exigé)', async () => {
      await prisma.user.update({ where: { email: adminEmail }, data: { totpLastStep: null } });
      const http = client(app);
      await http.post('/auth/2fa/backup-codes', adminToken).send({ code: '000000' }).expect(401);
      const res = await http
        .post('/auth/2fa/backup-codes', adminToken)
        .send({ code: code(secret, 0) })
        .expect(200);
      expect(res.body.backupCodes).toHaveLength(10);
      expect(res.body.backupCodes).not.toContain(backupCodes[1]);
    });
  });

  describe('contrôle d’accès par rôle', () => {
    it('un client ne peut pas consulter le journal d’audit (403)', async () => {
      const session = await registerVerifiedUser(app, inbox);
      const res = await session.http.get('/admin/audit-logs', session.accessToken).expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Accès refusé.' });
      await session.http
        .post('/auth/2fa/backup-codes', session.accessToken)
        .send({ code: '123456' })
        .expect(403);
    });

    it('l’administrateur consulte le journal (pagination par curseur, filtre, sans donnée personnelle)', async () => {
      const http = client(app);
      const page = await http.get('/admin/audit-logs?limit=2', adminToken).expect(200);
      expect(page.body.items).toHaveLength(2);
      expect(page.body.nextCursor).toEqual(page.body.items[1].id);
      const next = await http
        .get(`/admin/audit-logs?limit=2&cursor=${page.body.nextCursor as string}`, adminToken)
        .expect(200);
      expect(next.body.items[0].id < page.body.items[1].id).toBe(true);

      const filtered = await http
        .get('/admin/audit-logs?action=auth.mfa_enabled', adminToken)
        .expect(200);
      expect(filtered.body.items).toHaveLength(1);
      expect(JSON.stringify(filtered.body)).not.toContain(adminEmail);

      await http.get('/admin/audit-logs?limit=500', adminToken).expect(400);
      await http.get('/admin/audit-logs?action=DROP%20TABLE', adminToken).expect(400);
    });

    it('un administrateur ne peut pas supprimer son compte depuis l’espace client', async () => {
      const res = await client(app)
        .delete('/me', adminToken)
        .send({ password: PASSWORD })
        .expect(403);
      expect(res.body.message).toMatch(/administrateur/);
    });

    it('un jeton administrateur sans second facteur est refusé', async () => {
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
      const session = await prisma.session.create({
        data: { userId: admin.id, mfa: false, expiresAt: new Date(Date.now() + 3_600_000) },
      });
      const forged = app
        .get(AccessTokenService)
        .sign({ userId: admin.id, sessionId: session.id, role: 'admin', mfa: false });
      await client(app).get('/admin/audit-logs', forged.accessToken).expect(401);
    });
  });
});
