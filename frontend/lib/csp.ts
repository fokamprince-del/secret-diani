/**
 * Politique de sécurité du contenu (DECISIONS D-F05), partagée par `next.config.ts` (pages
 * statiques) et `proxy.ts` (pages privées, à nonce). Lu au build et dans le proxy : aucune
 * dépendance, uniquement des variables publiques.
 */
const isDev = process.env.NODE_ENV === 'development';

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL) ?? 'http://localhost:3000';
export const mediaOrigin = origin(process.env.NEXT_PUBLIC_MEDIA_URL);
const analyticsOrigin = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  ? (origin(process.env.NEXT_PUBLIC_PLAUSIBLE_SRC) ?? 'https://plausible.io')
  : null;
// Anti-robot des formulaires (Cloudflare Turnstile), seulement si une clé est configurée.
const captchaOrigin = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  ? 'https://challenges.cloudflare.com'
  : null;
// Lecture vidéo des leçons (Bunny Stream, URL signées fournies par l'API).
const videoOrigins = ['https://*.b-cdn.net', 'https://*.mediadelivery.net'];

const sources = (...values: (string | null | false | undefined)[]) =>
  values.filter(Boolean).join(' ');

/**
 * Pages privées ou sensibles (mots de passe, espace membre, panier, commande) : rendues à la
 * demande avec une CSP à nonce stricte, sans 'unsafe-inline' pour les scripts.
 */
export const PRIVATE_PATH_PREFIXES = [
  '/espace-membre',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/reinitialiser',
  '/verifier-email',
  '/confirmer-email',
  '/panier',
  '/commande',
] as const;

/**
 * Sans nonce (pages statiques) : 'unsafe-inline' pour les scripts RSC en ligne de Next, fichiers
 * JS limités à 'self' et vérifiés par intégrité (SRI). Avec nonce : seuls les scripts portant
 * le nonce (et ceux qu'ils chargent : 'strict-dynamic') s'exécutent.
 */
export function contentSecurityPolicy(nonce?: string): string {
  const scripts = nonce
    ? sources(`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`, isDev && `'unsafe-eval'`)
    : sources(
        `'self'`,
        `'unsafe-inline'`,
        isDev && `'unsafe-eval'`,
        analyticsOrigin,
        captchaOrigin,
      );
  return [
    `default-src 'self'`,
    `script-src ${scripts}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${sources(`'self'`, 'data:', 'blob:', apiOrigin, mediaOrigin)}`,
    `font-src 'self'`,
    `connect-src ${sources(`'self'`, apiOrigin, analyticsOrigin, captchaOrigin, ...videoOrigins, isDev && 'ws:')}`,
    `media-src ${sources(`'self'`, 'blob:', mediaOrigin, ...videoOrigins)}`,
    `worker-src 'self' blob:`,
    `frame-src ${captchaOrigin ?? `'none'`}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    !isDev && 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');
}
