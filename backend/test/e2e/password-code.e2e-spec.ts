import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { client, login, MailInbox, registerVerifiedUser, uniqueEmail } from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

const NEW_PASSWORD = 'Nouveau-Mot-De-Passe-2026';

describe('Mot de passe oublié : code à 6 chiffres (e2e)', () => {
  let app: INestApplication<App>;
  const inbox = new MailInbox();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  async function requestCode(email: string): Promise<string> {
    await client(app).post('/auth/password/forgot').send({ email }).expect(202);
    return (await inbox.last(email, 'password-reset')).data.code;
  }

  it('code juste : jeton de réinitialisation, puis nouveau mot de passe utilisable', async () => {
    const session = await registerVerifiedUser(app, inbox);
    const code = await requestCode(session.email);
    const verified = await client(app)
      .post('/auth/password/code')
      .send({ email: session.email.toUpperCase(), code })
      .expect(200);
    await client(app)
      .post('/auth/password/reset')
      .send({ token: verified.body.token, password: NEW_PASSWORD })
      .expect(200);
    await login(client(app), session.email, NEW_PASSWORD);
  });

  it('le code ne sert qu’une fois', async () => {
    const session = await registerVerifiedUser(app, inbox);
    const code = await requestCode(session.email);
    const http = client(app);
    await http.post('/auth/password/code').send({ email: session.email, code }).expect(200);
    const again = await http
      .post('/auth/password/code')
      .send({ email: session.email, code })
      .expect(400);
    expect(again.body.code).toBe('INVALID_RESET_CODE');
  });

  it('5 essais faux détruisent le code, même juste ensuite', async () => {
    const session = await registerVerifiedUser(app, inbox);
    const code = await requestCode(session.email);
    const wrong = code === '000000' ? '111111' : '000000';
    const http = client(app);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http
        .post('/auth/password/code')
        .send({ email: session.email, code: wrong })
        .expect(400);
    }
    await http.post('/auth/password/code').send({ email: session.email, code }).expect(400);
  });

  it('adresse inconnue : même réponse qu’un code faux (pas d’énumération)', async () => {
    const res = await client(app)
      .post('/auth/password/code')
      .send({ email: uniqueEmail('inconnue'), code: '123456' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_RESET_CODE');
  });

  it('format invalide refusé avant tout traitement', async () => {
    await client(app)
      .post('/auth/password/code')
      .send({ email: uniqueEmail(), code: '12ab' })
      .expect(400);
  });
});
