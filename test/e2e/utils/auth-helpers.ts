import type { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MAIL_QUEUE } from '../../../src/mail/mail.constants';
import type { MailJob } from '../../../src/mail/templates/template-data';
import { redisOptionsFromUrl } from '../../../src/redis/redis-options';

export const PASSWORD = 'Ganache-Mangue-Passion-2026';
export const API = '/api/v1';

let ipCounter = 0;

/** Adresse IP fictive unique : chaque test simule un client distinct (limitation de débit par IP). */
export function nextIp(): string {
  ipCounter += 1;
  return `198.18.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export function uniqueEmail(prefix = 'cliente'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.com`;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Client HTTP lié à une IP (X-Forwarded-For, TRUST_PROXY_HOPS=1 en test). */
export function client(app: INestApplication<App>, ip: string = nextIp()) {
  const server = app.getHttpServer();
  const call = (method: Method, path: string, token?: string) => {
    const req = request(server)[method](`${API}${path}`).set('X-Forwarded-For', ip);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  return {
    ip,
    get: (path: string, token?: string) => call('get', path, token),
    post: (path: string, token?: string) => call('post', path, token),
    put: (path: string, token?: string) => call('put', path, token),
    patch: (path: string, token?: string) => call('patch', path, token),
    delete: (path: string, token?: string) => call('delete', path, token),
  };
}

export type Client = ReturnType<typeof client>;

/** Lecture de la file d'e-mails (le worker ne tourne pas en e2e : les jobs restent en attente). */
export class MailInbox {
  private readonly queue = new Queue<MailJob>(MAIL_QUEUE, {
    prefix: 'diani:bull',
    connection: redisOptionsFromUrl(process.env.REDIS_URL ?? ''),
  });

  async all(to: string): Promise<MailJob[]> {
    const jobs = await this.queue.getJobs(['waiting', 'delayed', 'prioritized'], 0, -1, true);
    return jobs.filter((job) => job.data.to === to).map((job) => job.data);
  }

  async last<T extends MailJob['template']>(
    to: string,
    template: T,
  ): Promise<Extract<MailJob, { template: T }>> {
    const mails = (await this.all(to)).filter(
      (mail): mail is Extract<MailJob, { template: T }> => mail.template === template,
    );
    const mail = mails.at(-1);
    if (!mail) throw new Error(`Aucun e-mail « ${template} » pour ${to}`);
    return mail;
  }

  async count(to: string, template: MailJob['template']): Promise<number> {
    return (await this.all(to)).filter((mail) => mail.template === template).length;
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}

export function tokenFromLink(link: string): string {
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error('Lien sans jeton');
  return token;
}

/** Valeur et attributs du cookie de session dans une réponse. */
export function refreshCookie(res: request.Response): { value: string; header: string } | null {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const header = raw?.find((cookie) => cookie.startsWith('diani_rt='));
  if (!header) return null;
  return { value: header.split(';')[0]!.slice('diani_rt='.length), header };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  http: Client;
}

/** Inscription + confirmation de l'e-mail + connexion. */
export async function registerVerifiedUser(
  app: INestApplication<App>,
  inbox: MailInbox,
  options: { email?: string; password?: string; firstName?: string } = {},
): Promise<Session> {
  const email = options.email ?? uniqueEmail();
  const password = options.password ?? PASSWORD;
  const http = client(app);
  await http
    .post('/auth/register')
    .send({ email, password, firstName: options.firstName, acceptTerms: true })
    .expect(202);
  const mail = await inbox.last(email, 'verify-email');
  await http
    .post('/auth/email/verify')
    .send({ token: tokenFromLink(mail.data.link) })
    .expect(200);
  return login(http, email, password);
}

export async function login(http: Client, email: string, password: string): Promise<Session> {
  const res = await http.post('/auth/login').send({ email, password }).expect(200);
  const cookie = refreshCookie(res);
  if (!cookie) throw new Error('Cookie de session absent');
  return {
    accessToken: res.body.accessToken as string,
    refreshToken: cookie.value,
    userId: res.body.user.id as string,
    email,
    http,
  };
}

export function refresh(http: Client, refreshToken: string) {
  return http
    .post('/auth/refresh')
    .set('Cookie', `diani_rt=${refreshToken}`)
    .set('X-CSRF-Token', '1');
}
