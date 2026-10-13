// Copie la spécification OpenAPI du backend dans ce dépôt, puis régénère le client typé.
// Usage : npm run api:sync [-- <chemin ou URL de openapi.json>]
// Par défaut : ../backend/docs/openapi.json (dépôts voisins).
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const source = process.argv[2] ?? '../backend/docs/openapi.json';

const raw = /^https?:\/\//.test(source)
  ? await (await fetch(source, { signal: AbortSignal.timeout(15_000) })).text()
  : await readFile(source, 'utf8');

const spec = JSON.parse(raw);
if (typeof spec.openapi !== 'string' || typeof spec.paths !== 'object') {
  throw new Error(`${source} n'est pas une spécification OpenAPI.`);
}

await writeFile('openapi/openapi.json', `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Spécification copiée depuis ${source} (${Object.keys(spec.paths).length} chemins).`);
execSync('npm run api:generate', { stdio: 'inherit' });
