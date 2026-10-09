import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/test-app';

class ProbeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;
}

/** Contrôleur de test : exerce le socle (validation, erreurs, limitation de débit). */
@Controller('probe')
class ProbeController {
  @Post()
  echo(@Body() dto: ProbeDto): { quantity: number; keys: string[] } {
    return { quantity: dto.quantity, keys: Object.keys(dto) };
  }

  @Get('boom')
  boom(): never {
    throw new Error('panne interne : SELECT * FROM users WHERE password = ...');
  }

  @Get('limited')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  limited(): { ok: true } {
    return { ok: true };
  }
}

const validBody = { email: 'cliente@example.com', password: 'un-mot-de-passe-long', quantity: 2 };
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Socle (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp([ProbeController]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('sondes', () => {
    it('GET /health répond (hors préfixe /api/v1)', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('GET /ready vérifie réellement la base et Redis', async () => {
      const res = await request(app.getHttpServer()).get('/ready').expect(200);
      expect(res.body).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
    });

    it('les sondes ne sont pas servies sous le préfixe', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(404);
    });
  });

  describe('format des erreurs', () => {
    it('404 en français, sans écho de la route demandée', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/route-inexistante').expect(404);
      expect(res.body).toEqual({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
        requestId: expect.stringMatching(UUID_V7),
      });
      expect(JSON.stringify(res.body)).not.toContain('route-inexistante');
    });

    it('500 générique, sans fuite d’information interne', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/probe/boom').expect(500);
      expect(res.body.message).toBe(
        'Une erreur interne est survenue. Merci de réessayer plus tard.',
      );
      expect(JSON.stringify(res.body)).not.toMatch(/SELECT|password|stack/i);
    });

    it('JSON mal formé → 400 en français', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
      expect(res.body).toMatchObject({ code: 'BAD_REQUEST', message: 'La requête est invalide.' });
    });

    it('corps trop volumineux → 413', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .send({ ...validBody, padding: 'x'.repeat(200 * 1024) })
        .expect(413);
      expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    });
  });

  describe('validation stricte', () => {
    it('accepte un corps valide', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .send(validBody)
        .expect(201);
      expect(res.body).toEqual({ quantity: 2, keys: ['email', 'password', 'quantity'] });
    });

    it('détaille les erreurs par champ, en français', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .send({ email: 'pas-un-email', password: 'court', quantity: '3' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Les données envoyées sont invalides.');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: 'email', messages: ['doit être une adresse e-mail valide'] },
          { field: 'password', messages: ['doit contenir au moins 12 caractères'] },
          expect.objectContaining({ field: 'quantity' }),
        ]),
      );
      // Les valeurs soumises ne sont jamais renvoyées.
      expect(JSON.stringify(res.body)).not.toContain('pas-un-email');
    });

    it('refuse les champs non déclarés (anti mass-assignment)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/probe')
        .send({ ...validBody, role: 'admin' })
        .expect(400);
      expect(res.body.errors).toEqual([
        { field: 'role', messages: ['ce champ n’est pas autorisé'] },
      ]);
    });

    it('résiste à la pollution de prototype', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/probe')
        .set('Content-Type', 'application/json')
        .send(
          `{"email":"a@b.fr","password":"un-mot-de-passe-long","quantity":1,"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}}}`,
        )
        .expect(400);
      expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    });
  });

  describe('en-têtes de sécurité', () => {
    it('applique helmet (HSTS, nosniff, CSP stricte, pas de X-Powered-By)', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('renvoie un identifiant de requête et réutilise un identifiant entrant valide', async () => {
      const incoming = '01928f6e-7c1a-7b3e-9a6f-2f1c3d4e5f60';
      const res = await request(app.getHttpServer()).get('/health').set('X-Request-Id', incoming);
      expect(res.headers['x-request-id']).toBe(incoming);

      const forged = await request(app.getHttpServer())
        .get('/health')
        .set('X-Request-Id', 'faux-id-pour-injection');
      expect(forged.headers['x-request-id']).toMatch(UUID_V7);
    });
  });

  describe('CORS', () => {
    it('autorise le site, avec cookies', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/v1/probe')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('n’autorise pas une origine inconnue', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/v1/probe')
        .set('Origin', 'https://site-malveillant.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('limitation de débit (Redis)', () => {
    it('bloque au-delà de la limite avec un message français et Retry-After', async () => {
      const server = app.getHttpServer();
      for (let i = 0; i < 3; i += 1) {
        await request(server).get('/api/v1/probe/limited').expect(200);
      }
      const res = await request(server).get('/api/v1/probe/limited').expect(429);
      expect(res.body).toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        message: 'Trop de requêtes. Merci de réessayer dans quelques instants.',
      });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('documentation OpenAPI', () => {
    it('expose le document OpenAPI quand Swagger est activé', async () => {
      const res = await request(app.getHttpServer()).get('/api/docs/openapi.json').expect(200);
      expect(res.body.info.title).toBe('API Les Secrets de Diani');
      expect(res.body.paths['/health']).toBeDefined();
      expect(res.body.paths['/ready']).toBeDefined();
    });
  });
});
