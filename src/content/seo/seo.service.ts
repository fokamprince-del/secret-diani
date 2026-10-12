import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { escapeHtml } from '../../mail/templates/layout';
import { ContentCacheService } from '../cache/content-cache.service';
import { SiteInfoService } from '../common/site-info.service';

export interface SitemapEntry {
  loc: string;
  lastModified: string | null;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
}

/** Pages fixes du frontend (les pages éditoriales et articles viennent de la base). */
const STATIC_ROUTES: (Omit<SitemapEntry, 'loc' | 'lastModified'> & { path: string })[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/traiteur', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/formations', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/boutique', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/conseils', changeFrequency: 'daily', priority: 0.8 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
];

/** Espaces privés : jamais indexés. */
const DISALLOWED_PATHS = [
  '/espace-membre',
  '/panier',
  '/commande',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/reinitialiser',
  '/verifier-email',
  '/confirmer-email',
];

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
    private readonly site: SiteInfoService,
  ) {}

  sitemap(): Promise<SitemapEntry[]> {
    return this.cache.getOrSet('sitemap', async () => {
      const now = new Date();
      const [pages, articles] = await Promise.all([
        this.prisma.staticPage.findMany({
          where: { published: true },
          select: { slug: true, updatedAt: true },
        }),
        this.prisma.article.findMany({
          where: { deletedAt: null, status: 'published', publishedAt: { lte: now } },
          orderBy: { publishedAt: 'desc' },
          take: 5000,
          select: { slug: true, updatedAt: true },
        }),
      ]);
      return [
        ...STATIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
          loc: this.site.url(path),
          lastModified: null,
          changeFrequency,
          priority,
        })),
        ...pages.map((page) => ({
          loc: this.site.url(`/${page.slug}`),
          lastModified: page.updatedAt.toISOString(),
          changeFrequency: 'yearly' as const,
          priority: 0.3,
        })),
        ...articles.map((article) => ({
          loc: this.site.url(`/conseils/${article.slug}`),
          lastModified: article.updatedAt.toISOString(),
          changeFrequency: 'monthly' as const,
          priority: 0.7,
        })),
      ];
    });
  }

  async sitemapXml(): Promise<string> {
    const urls = (await this.sitemap())
      .map(
        (entry) =>
          `  <url><loc>${escapeHtml(entry.loc)}</loc>${
            entry.lastModified ? `<lastmod>${entry.lastModified}</lastmod>` : ''
          }<changefreq>${entry.changeFrequency}</changefreq><priority>${entry.priority.toFixed(1)}</priority></url>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  }

  robotsTxt(): string {
    return [
      'User-agent: *',
      'Allow: /',
      ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
      '',
      `Sitemap: ${this.site.url('/sitemap.xml')}`,
      '',
    ].join('\n');
  }

  async organizationJsonLd(): Promise<Record<string, unknown>> {
    const info = await this.site.get();
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: info.name,
      url: info.url,
      ...(info.logoUrl ? { logo: info.logoUrl } : {}),
      ...(info.instagramUrl ? { sameAs: [info.instagramUrl] } : {}),
    };
  }
}
