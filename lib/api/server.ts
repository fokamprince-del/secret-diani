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
  | 'sitemap';

/** Revalidation de secours si un webhook se perd : une heure. */
const FALLBACK_REVALIDATE_SECONDS = 3600;

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
