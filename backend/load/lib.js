// Utilitaires communs aux scénarios k6 (voir load/README.md).
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// BASE_URL : une adresse, ou plusieurs séparées par des virgules (une par instance de l'API,
// pour mesurer l'effet de plusieurs processus sans répartiteur de charge).
const BASE_URLS = (__ENV.BASE_URL || 'http://localhost:3000')
  .split(',')
  .map((url) => url.trim().replace(/\/$/, ''));

/** Préfixe de l'API pour une itération (répartition aléatoire entre les instances). */
export function api() {
  return `${BASE_URLS[Math.floor(Math.random() * BASE_URLS.length)]}/api/v1`;
}

/**
 * Chaque itération simule un visiteur distinct (adresse de la plage de test 198.18.0.0/15) :
 * sans cela, les limites de débit par IP de l'API refuseraient le test. Pris en compte
 * seulement si l'API fait confiance au premier proxy (TRUST_PROXY_HOPS=1) et que k6 l'appelle
 * directement : jamais à travers Cloudflare et Traefik, qui ne transmettent pas cet en-tête.
 */
export function visitorHeaders(extra = {}) {
  const ip = `198.${randomIntBetween(18, 19)}.${randomIntBetween(0, 255)}.${randomIntBetween(1, 254)}`;
  return { 'X-Forwarded-For': ip, 'Content-Type': 'application/json', ...extra };
}

/** Jeton Turnstile factice : accepté par la clé secrète de test « toujours valide » de Cloudflare. */
export const CAPTCHA_TOKEN = __ENV.CAPTCHA_TOKEN || 'XXXX.DUMMY.TOKEN.XXXX';
