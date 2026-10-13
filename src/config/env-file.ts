import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/**
 * Chargement de l'environnement : PREMIER import de chaque point d'entrée (API, worker, CLI).
 *
 * Le client Prisma charge lui-même `.env` à l'import (chemin figé par `prisma generate` quand
 * le fichier existe) et y prend toutes les clés absentes de `process.env`. Avant ce module,
 * `NODE_ENV=test` hors Jest utilisait la base de développement, et des clés de `.env` se
 * mêlaient à celles de `.env.test` (audit de conformité, constat N2). Désormais :
 * 1. le fichier de l'environnement courant est chargé avant tout import tiers ; les variables
 *    déjà définies (conteneur, CI) gardent la priorité ;
 * 2. une copie de l'environnement est figée ici, et la configuration est validée à partir de
 *    cette copie : ce qu'une bibliothèque ajoute ensuite à `process.env` est ignoré.
 * En production, aucun fichier n'est lu : la configuration vient du conteneur.
 */
export function envFileFor(nodeEnv: string | undefined): string | null {
  if (nodeEnv === 'production') return null;
  return nodeEnv === 'test' ? '.env.test' : '.env';
}

let snapshot: Readonly<Record<string, string | undefined>> | undefined;

/** Charge le fichier (une seule fois) et renvoie l'environnement figé. */
export function loadEnvironment(): Readonly<Record<string, string | undefined>> {
  if (!snapshot) {
    const file = envFileFor(process.env.NODE_ENV);
    if (file && existsSync(file)) {
      // Lecture explicite plutôt que process.loadEnvFile : même effet, mais applicable à
      // l'objet process.env visible du code (isolé sous Jest).
      for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
        process.env[key] ??= value;
      }
    }
    snapshot = Object.freeze({ ...process.env });
  }
  return snapshot;
}

loadEnvironment();
