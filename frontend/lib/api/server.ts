import 'server-only';
import { serverEnv } from '../server-env';
import { createApiClient } from './client';

/**
 * Étiquettes de cache, identiques à celles qu'envoie l'API au webhook de revalidation
 * (`ContentTag` côté backend). Une modification admin régénère les pages concernées.
 */
export type CacheTag =
  | 'articles'
  | `article:${string}`
  | 'article-categories'
  | 'pages'
  | `page:${string}`
  | 'faq'
  | 'reviews'
  | 'media'
  | 'catering'
  | 'shop'
  | 'courses'
  | 'site'
  | 'sitemap';

/**
 * Revalidation de secours : cinq minutes. Couvre un webhook perdu et, surtout, une page
 * construite pendant que l'API était injoignable (build Docker) : elle se répare seule
 * au lieu de rester dégradée (DECISIONS D-F04, D-F12).
 */
export const FALLBACK_REVALIDATE_SECONDS = 300;

/** Client des composants serveur : passe par le réseau interne quand il est configuré. */
export const serverApi = createApiClient(serverEnv.apiBaseUrl);

/**
 * `fetch` mis en cache par Next (ISR) et étiqueté pour la revalidation à la demande.
 * À passer en option `fetch` d'un appel `serverApi.GET(...)`.
 */
export function cached(
  tags: CacheTag[],
  revalidate: number = FALLBACK_REVALIDATE_SECONDS,
): (request: Request) => Promise<Response> {
  return (request) => fetch(request, { next: { tags, revalidate } });
}
