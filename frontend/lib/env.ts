import { z } from 'zod';

/**
 * Variables publiques, lues aussi dans le navigateur. Next remplace `process.env.NEXT_PUBLIC_*`
 * à la compilation : chaque variable doit être citée littéralement (pas d'accès dynamique).
 */
const publicSchema = z.object({
  siteUrl: z.url().default('http://localhost:5173'),
  apiUrl: z.url().default('http://localhost:3000'),
  mediaUrl: z.url().optional(),
  plausibleDomain: z.string().min(1).optional(),
  plausibleSrc: z.url().default('https://plausible.io/js/script.js'),
});

const empty = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);

export const publicEnv = publicSchema.parse({
  siteUrl: empty(process.env.NEXT_PUBLIC_SITE_URL),
  apiUrl: empty(process.env.NEXT_PUBLIC_API_URL),
  mediaUrl: empty(process.env.NEXT_PUBLIC_MEDIA_URL),
  plausibleDomain: empty(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN),
  plausibleSrc: empty(process.env.NEXT_PUBLIC_PLAUSIBLE_SRC),
});

/** URL absolue sur le site public, sans barre finale en double. */
export function siteUrl(path = '/'): string {
  return new URL(path, publicEnv.siteUrl).toString();
}
