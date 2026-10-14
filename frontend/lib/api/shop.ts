import { ensureSession, getSession, hasSessionHint } from '../auth/session';
import { publicEnv } from '../env';
import { createApiClient, unwrap } from './client';
import type { components } from './schema';

export type Cart = components['schemas']['CartDto'];

/**
 * Requêtes de la boutique (panier, commande, paiement) : le panier invité est un cookie
 * HttpOnly de l'API ; une fois connectée, le jeton d'accès est ajouté et c'est le panier du
 * compte qui sert. Les modifications portent l'en-tête CSRF exigé par l'API.
 */
async function shopFetch(request: Request): Promise<Response> {
  const headers = new Headers(request.headers);
  if (request.method !== 'GET') headers.set('X-CSRF-Token', '1');
  const session = getSession() ?? (hasSessionHint() ? await ensureSession() : null);
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  return fetch(new Request(request, { headers }));
}

export const shopApi = createApiClient(publicEnv.apiUrl, shopFetch);

/** En-tête exigé par l'API sur les modifications du panier (déclaré dans l'OpenAPI). */
export const CSRF = { 'x-csrf-token': '1' } as const;

/** Après connexion : le panier invité rejoint celui du compte (sans effet s'il est vide). */
export async function mergeGuestCart(): Promise<Cart | null> {
  try {
    return unwrap(await shopApi.POST('/api/v1/shop/cart/merge', { params: { header: CSRF } }));
  } catch {
    return null;
  }
}
