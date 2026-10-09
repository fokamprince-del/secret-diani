import Redis from 'ioredis';
import { RedisThrottlerStorage } from '../../src/common/throttler/redis-throttler.storage';

/** Compteur partagé via Redis réel : atomicité sous concurrence et blocage. */
describe('RedisThrottlerStorage (e2e)', () => {
  let redis: Redis;
  let storage: RedisThrottlerStorage;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL ?? '', { keyPrefix: 'diani:' });
    storage = new RedisThrottlerStorage(redis);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('compte exactement les appels concurrents (aucune course)', async () => {
    const key = `concurrence-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 50 }, () => storage.increment(key, 60_000, 100, 60_000, 'test')),
    );
    const hits = results.map((record) => record.totalHits).sort((a, b) => a - b);
    expect(hits).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
  });

  it('bloque pendant la durée de blocage une fois la limite dépassée', async () => {
    const key = `blocage-${Date.now()}`;
    await storage.increment(key, 60_000, 2, 30_000, 'test');
    await storage.increment(key, 60_000, 2, 30_000, 'test');
    const third = await storage.increment(key, 60_000, 2, 30_000, 'test');
    expect(third.isBlocked).toBe(true);
    expect(third.timeToBlockExpire).toBe(30);

    const fourth = await storage.increment(key, 60_000, 2, 30_000, 'test');
    expect(fourth.isBlocked).toBe(true);
    expect(fourth.timeToExpire).toBeGreaterThan(0);
  });

  it('isole les compteurs par clé', async () => {
    const a = await storage.increment(`a-${Date.now()}`, 60_000, 5, 60_000, 'test');
    const b = await storage.increment(`b-${Date.now()}`, 60_000, 5, 60_000, 'test');
    expect([a.totalHits, b.totalHits]).toEqual([1, 1]);
  });
});
