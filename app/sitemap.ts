import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';
import { cached, serverApi } from '@/lib/api/server';

/** Pages fixes, toujours présentes même si l'API ne répond pas pendant la génération. */
const STATIC_PATHS: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/traiteur', priority: 0.9 },
  { path: '/formations', priority: 0.9 },
  { path: '/boutique', priority: 0.9 },
  { path: '/conseils', priority: 0.7 },
  { path: '/a-propos', priority: 0.6 },
  { path: '/contact', priority: 0.6 },
  { path: '/faq', priority: 0.5 },
];

/**
 * Plan du site : pages fixes + contenus publiés fournis par l'API (articles, pages…).
 * Revalidé quand l'API signale une modification (étiquette `sitemap`).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const { path, priority } of STATIC_PATHS) {
    const url = siteUrl(path);
    entries.set(url, { url, priority, changeFrequency: 'weekly' });
  }

  try {
    const { data } = await serverApi.GET('/api/v1/seo/sitemap', { fetch: cached(['sitemap']) });
    for (const entry of data ?? []) {
      // L'API renvoie des URL absolues sur le site public ; on n'accepte que celles-ci.
      const url = new URL(entry.loc, siteUrl('/'));
      if (url.origin !== new URL(siteUrl('/')).origin) continue;
      entries.set(url.toString(), {
        url: url.toString(),
        lastModified: entry.lastModified ?? undefined,
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
      });
    }
  } catch (error) {
    // Les pages fixes suffisent ; la prochaine revalidation complètera la liste.
    console.warn(`Plan du site : contenus de l’API indisponibles (${(error as Error).message})`);
  }

  return [...entries.values()];
}
