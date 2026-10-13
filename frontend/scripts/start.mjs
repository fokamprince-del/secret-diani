// Démarre le serveur autonome produit par `next build` (`output: 'standalone'`).
// `next start` ne sert pas ce mode : il faut lancer `.next/standalone/server.js`,
// après y avoir copié les fichiers statiques (voir `prepare-standalone.mjs`).
// Usage : npm run start   (PORT et HOSTNAME surchargeables par l'environnement)
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const server = resolve('.next/standalone/server.js');
if (!existsSync(server)) {
  console.error('Build introuvable : lancez d’abord `npm run build`.');
  process.exit(1);
}

process.env.PORT ??= '5173';
process.env.HOSTNAME ??= '0.0.0.0';
await import(pathToFileURL(server).href);
