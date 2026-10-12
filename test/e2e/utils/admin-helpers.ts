import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { totp } from '../../../src/auth/mfa/totp';
import { createAdmin } from '../../../src/cli/create-admin.core';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { client, type Client, PASSWORD, uniqueEmail } from './auth-helpers';

export interface AdminSession {
  accessToken: string;
  userId: string;
  http: Client;
}

/** Crée un administrateur et ouvre une session complète (mot de passe + enrôlement TOTP). */
export async function createAdminSession(app: INestApplication<App>): Promise<AdminSession> {
  const prisma = app.get(PrismaService);
  const email = uniqueEmail('admin');
  const created = await createAdmin(prisma, { email, password: PASSWORD, termsVersion: 'admin' });
  if (!created.ok) throw new Error(created.errors.join(' '));

  const http = client(app);
  const login = await http.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
  const mfaToken = login.body.mfaToken as string;
  const enroll = await http.post('/auth/2fa/enroll').send({ mfaToken }).expect(200);
  const confirmed = await http
    .post('/auth/2fa/enroll/confirm')
    .send({ mfaToken, code: totp(enroll.body.secret as string) })
    .expect(200);
  return { accessToken: confirmed.body.accessToken as string, userId: created.userId, http };
}
