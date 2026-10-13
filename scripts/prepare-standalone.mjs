// Complète le serveur autonome après `next build` : Next n'y copie ni `.next/static`
// ni `public/`, qui doivent être servis à côté de `server.js` (même chose dans le Dockerfile).
import { cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const target = '.next/standalone';
if (!existsSync(target)) {
  throw new Error('`.next/standalone` absent : vérifiez `output: "standalone"` dans next.config.');
}

await cp('.next/static', `${target}/.next/static`, { recursive: true });
if (existsSync('public')) await cp('public', `${target}/public`, { recursive: true });
console.log('Serveur autonome prêt : .next/standalone/server.js');
