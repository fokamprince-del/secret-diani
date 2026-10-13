import type Redis from 'ioredis';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

function createService(db: () => Promise<void>, redisPing: () => Promise<string>): HealthService {
  const prisma = { ping: jest.fn(db) } as unknown as PrismaService;
  const redis = { ping: jest.fn(redisPing) } as unknown as Redis;
  const service = new HealthService(prisma, redis);
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  return service;
}

describe('HealthService', () => {
  it('est prêt quand la base et Redis répondent', async () => {
    const service = createService(
      () => Promise.resolve(),
      () => Promise.resolve('PONG'),
    );
    await expect(service.readiness()).resolves.toEqual({
      ready: true,
      checks: { database: 'ok', redis: 'ok' },
    });
  });

  it('signale la dépendance en échec', async () => {
    const service = createService(
      () => Promise.reject(new Error('connexion refusée')),
      () => Promise.resolve('PONG'),
    );
    await expect(service.readiness()).resolves.toEqual({
      ready: false,
      checks: { database: 'erreur', redis: 'ok' },
    });
  });

  it('considère une dépendance trop lente comme en échec', async () => {
    jest.useFakeTimers();
    const service = createService(
      () => Promise.resolve(),
      () => new Promise<string>(() => undefined),
    );
    const pending = service.readiness();
    await jest.advanceTimersByTimeAsync(2_500);
    await expect(pending).resolves.toMatchObject({ ready: false, checks: { redis: 'erreur' } });
    jest.useRealTimers();
  });
});
