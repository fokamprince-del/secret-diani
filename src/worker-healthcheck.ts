/**
 * Sonde de santé du conteneur worker (exécutée par Docker, sans shell) :
 * succès si le worker de CE conteneur a signalé sa présence récemment.
 */
import Redis from 'ioredis';
import { hostname } from 'node:os';
import { WORKER_HEARTBEAT_KEY } from './jobs/worker-heartbeat.constants';
import { redisOptionsFromUrl } from './redis/redis-options';

async function main(): Promise<number> {
  const url = process.env.REDIS_URL;
  if (!url) return 1;
  const redis = new Redis({
    ...redisOptionsFromUrl(url),
    keyPrefix: 'diani:',
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
  });
  try {
    const value = await redis.get(`${WORKER_HEARTBEAT_KEY}:${hostname()}`);
    return value ? 0 : 1;
  } catch {
    return 1;
  } finally {
    redis.disconnect();
  }
}

void main().then((code) => process.exit(code));
