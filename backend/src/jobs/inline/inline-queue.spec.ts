/* eslint-disable @typescript-eslint/require-await -- consommateurs factices, sans E/S. */
import { MemoryRedis } from '../../redis/memory-redis';
import { InlineQueue, type InlineJob } from './inline-queue';

describe('MemoryRedis (sans REDIS_URL)', () => {
  let redis: MemoryRedis;
  beforeEach(() => (redis = new MemoryRedis()));
  afterEach(() => redis.disconnect());

  it('SET PX expire la clé ; KEEPTTL garde l’échéance', async () => {
    await redis.set('code', 'a', 'PX', 50);
    expect(await redis.get('code')).toBe('a');
    const ttl = await redis.pttl('code');
    await redis.set('code', 'b', 'KEEPTTL');
    expect(await redis.pttl('code')).toBeLessThanOrEqual(ttl);
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(await redis.get('code')).toBeNull();
    expect(await redis.pttl('code')).toBe(-2);
  });

  it('INCR + PEXPIRE NX en MULTI : la fenêtre ne s’allonge pas', async () => {
    const first = await redis.multi().incr('k').pexpire('k', 1_000, 'NX').exec();
    const second = await redis.multi().incr('k').pexpire('k', 60_000, 'NX').exec();
    expect(first.map(([, value]) => value)).toEqual([1, 1]);
    expect(second.map(([, value]) => value)).toEqual([2, 0]);
    expect(await redis.pttl('k')).toBeLessThanOrEqual(1_000);
  });

  it('GETDEL, DEL et EXISTS', async () => {
    await redis.set('a', '1');
    await redis.set('b', '2');
    expect(await redis.exists('a', 'b', 'c')).toBe(2);
    expect(await redis.getdel('a')).toBe('1');
    expect(await redis.del('a', 'b')).toBe(1);
  });
});

describe('InlineQueue (tâches dans l’API)', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('exécute la tâche, ignore un jobId déjà vu', async () => {
    const queue = new InlineQueue('test');
    const seen: string[] = [];
    queue.bind({
      process: async (job) => {
        seen.push(job.name);
      },
      onFailed: [],
    });
    await queue.add('a', {}, { jobId: 'x' });
    await queue.add('a', {}, { jobId: 'x' });
    await flush();
    expect(seen).toEqual(['a']);
    queue.close();
  });

  it('attend que le consommateur soit relié', async () => {
    const queue = new InlineQueue('test');
    const seen: unknown[] = [];
    await queue.add('a', { n: 1 });
    queue.bind({ process: async (job) => void seen.push(job.data), onFailed: [] });
    await flush();
    expect(seen).toEqual([{ n: 1 }]);
    queue.close();
  });

  it('relance puis signale l’échec définitif aux écouteurs « failed »', async () => {
    const queue = new InlineQueue('test');
    let calls = 0;
    const failed: InlineJob[] = [];
    queue.bind({
      process: async () => {
        calls++;
        throw new Error('panne');
      },
      onFailed: [(job) => void failed.push(job)],
    });
    await queue.add('a', {}, { attempts: 3, backoff: { type: 'fixed', delay: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(calls).toBe(3);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.attemptsMade).toBe(3);
    queue.close();
  });

  it('UnrecoverableError : pas de relance', async () => {
    const queue = new InlineQueue('test');
    let calls = 0;
    queue.bind({
      process: async () => {
        calls++;
        const error = new Error('adresse invalide');
        error.name = 'UnrecoverableError';
        throw error;
      },
      onFailed: [],
    });
    await queue.add('a', {}, { backoff: { type: 'fixed', delay: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).toBe(1);
    queue.close();
  });
});
