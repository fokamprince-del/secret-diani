import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
  uniqueEmail,
} from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

const CLIENT_ID = 'e2e-client.apps.googleusercontent.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Jeton d'identité non signé : seules les revendications sont lues (reçu de Google sur TLS). */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}

describe('Connexion avec Google (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const inbox = new MailInbox();
  const realFetch = global.fetch;
  let googleClaims: Record<string, unknown> = {};
  let tokenRequests: URLSearchParams[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    // Seul l'échange du code chez Google est simulé ; tout autre appel sort normalement.
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url !== TOKEN_URL) return realFetch(input, init);
      tokenRequests.push(init?.body as URLSearchParams);
      return new Response(JSON.stringify({ id_token: idToken(googleClaims) }), { status: 200 });
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await inbox.close();
    await app.close();
  });

  beforeEach(() => {
    tokenRequests = [];
  });

  const server = () => request(app.getHttpServer());

  /** Départ vers Google : renvoie le state, le nonce et le cookie posé. */
  async function start(suite?: string) {
    const res = await server()
      .get('/api/v1/auth/google')
      .query(suite ? { suite } : {})
      .expect(302);
    const location = new URL(res.headers.location as string);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((value) => value.startsWith('diani_google_state='))!;
    return {
      location,
      state: location.searchParams.get('state')!,
      nonce: location.searchParams.get('nonce')!,
      cookie: cookie.split(';')[0]!,
      cookieHeader: cookie,
    };
  }

  function claimsFor(email: string, nonce: string, extra: Record<string, unknown> = {}) {
    return {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: `google-${email}`,
      email,
      email_verified: true,
      given_name: 'Awa',
      family_name: 'Diallo',
      nonce,
      ...extra,
    };
  }

  it('redirige vers Google avec state, nonce, PKCE et un cookie lié au navigateur', async () => {
    const { location, cookieHeader } = await start('/formations');
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(location.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/v1/auth/google/callback',
    );
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(cookieHeader).toMatch(/HttpOnly/);
    expect(cookieHeader).toMatch(/SameSite=Lax/);
    expect(cookieHeader).toMatch(/Path=\/api\/v1\/auth\/google/);
  });

  it('crée un compte client confirmé, ouvre la session et revient sur la page demandée', async () => {
    const email = uniqueEmail('google');
    const flow = await start('/formations');
    googleClaims = claimsFor(email, flow.nonce);

    const res = await server()
      .get('/api/v1/auth/google/callback')
      .query({ code: 'code-e2e', state: flow.state })
      .set('Cookie', flow.cookie)
      .expect(302);

    expect(res.headers.location).toBe('http://localhost:5173/connexion/google?suite=%2Fformations');
    expect(refreshCookie(res)).not.toBeNull();
    expect(tokenRequests[0]?.get('code_verifier')).toHaveLength(43);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.googleSubject).toBe(`google-${email}`);
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.passwordHash).toBeNull();
    expect(user.firstName).toBe('Awa');
    expect(user.role).toBe('client');
  });

  it('relie un compte existant de même e-mail, qui garde son mot de passe', async () => {
    const session = await registerVerifiedUser(app, inbox);
    const flow = await start();
    googleClaims = claimsFor(session.email, flow.nonce);

    await server()
      .get('/api/v1/auth/google/callback')
      .query({ code: 'code-e2e', state: flow.state })
      .set('Cookie', flow.cookie)
      .expect(302)
      .expect('location', /\/connexion\/google\?suite=%2Fespace-membre$/);

    expect(await prisma.user.count({ where: { email: session.email } })).toBe(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: session.email } });
    expect(user.googleSubject).toBe(`google-${session.email}`);
    await login(client(app), session.email, PASSWORD);
  });

  it('refuse un retour sans le cookie du navigateur de départ (state)', async () => {
    const flow = await start();
    googleClaims = claimsFor(uniqueEmail('google'), flow.nonce);
    await server()
      .get('/api/v1/auth/google/callback')
      .query({ code: 'code-e2e', state: flow.state })
      .expect(302)
      .expect('location', 'http://localhost:5173/connexion?erreur=google_expire');
    expect(tokenRequests).toHaveLength(0);
  });

  it('refuse un jeton au mauvais nonce ou à l’e-mail non vérifié', async () => {
    for (const extra of [{ nonce: 'autre' }, { email_verified: false }]) {
      const flow = await start();
      googleClaims = { ...claimsFor(uniqueEmail('google'), flow.nonce), ...extra };
      await server()
        .get('/api/v1/auth/google/callback')
        .query({ code: 'code-e2e', state: flow.state })
        .set('Cookie', flow.cookie)
        .expect(302)
        .expect('location', 'http://localhost:5173/connexion?erreur=google_refuse');
    }
  });

  it('un state ne sert qu’une fois, et l’annulation chez Google revient proprement', async () => {
    const flow = await start();
    googleClaims = claimsFor(uniqueEmail('google'), flow.nonce);
    const callback = () =>
      server()
        .get('/api/v1/auth/google/callback')
        .query({ code: 'code-e2e', state: flow.state })
        .set('Cookie', flow.cookie);
    await callback()
      .expect(302)
      .expect('location', /\/connexion\/google/);
    await callback()
      .expect(302)
      .expect('location', /erreur=google_expire$/);

    await server()
      .get('/api/v1/auth/google/callback')
      .query({ error: 'access_denied' })
      .expect(302)
      .expect('location', /erreur=google_annule$/);
  });

  it('ignore une page de retour externe (pas de redirection ouverte)', async () => {
    const flow = await start('https://exemple-malveillant.fr');
    googleClaims = claimsFor(uniqueEmail('google'), flow.nonce);
    await server()
      .get('/api/v1/auth/google/callback')
      .query({ code: 'code-e2e', state: flow.state })
      .set('Cookie', flow.cookie)
      .expect(302)
      .expect('location', 'http://localhost:5173/connexion/google?suite=%2Fespace-membre');
  });

  it('compte Google sans mot de passe : suppression possible juste après une connexion', async () => {
    const email = uniqueEmail('google');
    const flow = await start();
    googleClaims = claimsFor(email, flow.nonce);
    const res = await server()
      .get('/api/v1/auth/google/callback')
      .query({ code: 'code-e2e', state: flow.state })
      .set('Cookie', flow.cookie)
      .expect(302);
    const http = client(app);
    const opened = await refresh(http, refreshCookie(res)!.value).expect(200);
    const accessToken = opened.body.accessToken as string;

    const profile = await http.get('/me', accessToken).expect(200);
    expect(profile.body).toMatchObject({ hasPassword: false, googleLinked: true });

    // Connexion trop ancienne : il faut se reconnecter avec Google.
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 20 * 60_000) },
    });
    const stale = await http.delete('/me', accessToken).send({}).expect(403);
    expect(stale.body.code).toBe('REAUTH_REQUIRED');

    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date() },
    });
    await http.delete('/me', accessToken).send({}).expect(204);
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(deleted).toMatchObject({ status: 'deleted', googleSubject: null });
  });
});
