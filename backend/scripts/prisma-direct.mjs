/**
 * Lance une commande Prisma (migrate deploy, db seed, migrate status…) sur la connexion
 * DIRECTE à la base, sans passer par le pooler.
 *
 * Neon (et tout PgBouncer en mode transaction) : l'API et le worker se connectent par l'URL
 * « pooled » (DATABASE_URL, hôte en -pooler), mais les migrations ont besoin d'une session
 * à elles : verrou consultatif de `prisma migrate`, DDL. Elles passent donc par DIRECT_URL.
 * Sans DIRECT_URL (développement local, Docker), DATABASE_URL sert aux deux.
 *
 * Usage : node scripts/prisma-direct.mjs migrate deploy
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const direct = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!direct) {
  console.error('DIRECT_URL ou DATABASE_URL est obligatoire.');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: direct },
});
process.exit(result.status ?? 1);
