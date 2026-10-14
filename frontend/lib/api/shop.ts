import { optionalAuthApi } from './authed';
import { unwrap } from './client';
import type { components } from './schema';

export type Cart = components['schemas']['CartDto'];

/**
 * Requêtes de la boutique (panier, commande, paiement) : le panier invité est un cookie
 * HttpOnly de l'API ; une fois connectée, c'est le panier du compte (jeton ajouté).
 */
export const shopApi = optionalAuthApi;

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
