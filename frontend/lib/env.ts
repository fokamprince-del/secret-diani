/**
 * Variables publiques, lues aussi dans le navigateur. Next remplace `process.env.NEXT_PUBLIC_*`
 * à la compilation : chaque variable doit être citée littéralement (pas d'accès dynamique).
 *
 * Validation écrite à la main plutôt qu'avec Zod : ce module est chargé sur toutes les pages,
 * Zod y ajouterait une quinzaine de ko de JavaScript (budget, DECISIONS D-F11). Une valeur
 * invalide fait échouer le build, comme le ferait un schéma.
 */
const empty = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);

function url(name: string, value: string | undefined, fallback?: string): string | undefined {
  const raw = empty(value) ?? fallback;
  if (raw === undefined) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
    return raw;
  } catch {
    throw new Error(`${name} doit être une adresse http(s) valide (reçu : « ${raw} »).`);
  }
}

export const publicEnv = {
  siteUrl: url('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL, 'http://localhost:5173')!,
  apiUrl: url('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL, 'http://localhost:3000')!,
  mediaUrl: url('NEXT_PUBLIC_MEDIA_URL', process.env.NEXT_PUBLIC_MEDIA_URL),
  plausibleDomain: empty(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN),
  plausibleSrc: url(
    'NEXT_PUBLIC_PLAUSIBLE_SRC',
    process.env.NEXT_PUBLIC_PLAUSIBLE_SRC,
    'https://plausible.io/js/script.js',
  )!,
  /** Clé publique Cloudflare Turnstile (anti-robot des formulaires) ; absente : pas de captcha. */
  turnstileSiteKey: empty(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
} as const;

/** URL absolue sur le site public, sans barre finale en double. */
export function siteUrl(path = '/'): string {
  return new URL(path, publicEnv.siteUrl).toString();
}
