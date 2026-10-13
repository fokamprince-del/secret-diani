import { execSync } from 'node:child_process';
import Redis from 'ioredis';

/**
 * Prépare l'infrastructure éphémère (docker-compose.test.yml ou services CI, données en mémoire) :
 * applique les migrations versionnées — exactement comme en production — puis vide Redis.
 * Aucune commande destructrice (`migrate reset`) : l'isolation vient du conteneur jetable.
 *
 * Comme en production, les migrations passent par le rôle propriétaire du schéma
 * (MIGRATION_DATABASE_URL) et l'API par le rôle à privilèges minimaux `diani_app`
 * (DATABASE_URL), dont la connexion est activée ici avec le mot de passe de DATABASE_URL.
 */
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.loadEnvFile('.env.test');

  const ownerUrl = process.env.MIGRATION_DATABASE_URL ?? '';
  const ownerEnv = { ...process.env, DATABASE_URL: ownerUrl };
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: ownerEnv });

  const appPassword = decodeURIComponent(new URL(process.env.DATABASE_URL ?? '').password);
  execSync(`npx prisma db execute --stdin --url "${ownerUrl}"`, {
    input: `ALTER ROLE diani_app WITH LOGIN PASSWORD '${appPassword.replaceAll("'", "''")}';`,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: ownerEnv,
  });

  const redis = new Redis(process.env.REDIS_URL ?? '');
  await redis.flushdb();
  redis.disconnect();
}
