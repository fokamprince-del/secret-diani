import { execSync } from 'node:child_process';
import Redis from 'ioredis';

/**
 * Prépare l'infrastructure éphémère (docker-compose.test.yml ou services CI, données en mémoire) :
 * applique les migrations versionnées — exactement comme en production — puis vide Redis.
 * Aucune commande destructrice (`migrate reset`) : l'isolation vient du conteneur jetable.
 */
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.loadEnvFile('.env.test');

  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });

  const redis = new Redis(process.env.REDIS_URL ?? '');
  await redis.flushdb();
  redis.disconnect();
}
