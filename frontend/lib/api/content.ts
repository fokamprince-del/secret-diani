import 'server-only';
import { notFound } from 'next/navigation';
import { unwrap } from './client';
import { ApiError } from './errors';
import { cached, serverApi } from './server';

export type * from './types';

type Result<T> = { data?: T; error?: unknown; response: Response };

const isBuild = () => process.env.NEXT_PHASE === 'phase-production-build';

/**
 * Lit un contenu public de l'API.
 * - Pendant le build (API parfois injoignable, comme dans l'image Docker) : `null`, la page
 *   s'affiche sans ce contenu et se régénère à la revalidation suivante (D-F12).
 * - À l'exécution : l'erreur remonte. Next garde alors la dernière version réussie de la page
 *   (ISR) au lieu de la remplacer par une version dégradée ; sans version en cache, la page
 *   d'erreur propose de réessayer.
 * - 404 : `notFound()` si demandé (page ou article inexistant), sinon `null`.
 */
async function load<T>(
  what: string,
  request: () => Promise<Result<T>>,
  { notFoundOn404 = false } = {},
): Promise<T | null> {
  let missing = false;
  try {
    return unwrap(await request());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      missing = true;
    } else if (isBuild()) {
      console.warn(`Build : ${what} indisponible (${(error as Error).message})`);
      return null;
    } else {
      throw error;
    }
  }
  if (missing && notFoundOn404) notFound();
  return null;
}

/** Adresse d'une page ou d'un article : minuscules, chiffres et tirets (rien d'autre n'est demandé à l'API). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function getSiteSettings() {
  return load('réglages du site', () =>
    serverApi.GET('/api/v1/site/settings', { fetch: cached(['site']) }),
  );
}

export function getHomeContent() {
  return load('contenus de l’accueil', () =>
    serverApi.GET('/api/v1/site/home', { fetch: cached(['site', 'media']) }),
  );
}

export function getReviews(limit = 6) {
  return load('avis', () =>
    serverApi.GET('/api/v1/content/reviews', {
      params: { query: { limit } },
      fetch: cached(['reviews']),
    }),
  );
}

export function getFaq() {
  return load('questions fréquentes', () =>
    serverApi.GET('/api/v1/content/faq', { fetch: cached(['faq']) }),
  );
}

export function getOrganization() {
  return load<unknown>('données de la marque', () =>
    serverApi.GET('/api/v1/seo/organization', { fetch: cached(['site']) }),
  );
}

export function getPageLinks() {
  return load('liste des pages', () =>
    serverApi.GET('/api/v1/content/pages', { fetch: cached(['pages']) }),
  );
}

export async function getPage(slug: string) {
  if (!SLUG_PATTERN.test(slug)) notFound();
  return load(
    `page « ${slug} »`,
    () =>
      serverApi.GET('/api/v1/content/pages/{slug}', {
        params: { path: { slug } },
        fetch: cached(['pages', `page:${slug}`]),
      }),
    { notFoundOn404: true },
  );
}

/** Page publiée, ou `null` si elle n'existe pas encore (sans renvoyer de 404 à la place). */
export function getPageIfPublished(slug: string) {
  return load(`page « ${slug} »`, () =>
    serverApi.GET('/api/v1/content/pages/{slug}', {
      params: { path: { slug } },
      fetch: cached(['pages', `page:${slug}`]),
    }),
  );
}

export function getArticleCategories() {
  return load('catégories d’articles', () =>
    serverApi.GET('/api/v1/content/article-categories', { fetch: cached(['article-categories']) }),
  );
}

export const ARTICLES_PER_PAGE = 12;

export function getArticles(category?: string) {
  return load('articles', () =>
    serverApi.GET('/api/v1/content/articles', {
      params: { query: { category, limit: ARTICLES_PER_PAGE } },
      fetch: cached(['articles']),
    }),
  );
}

export async function getArticle(slug: string) {
  if (!SLUG_PATTERN.test(slug)) notFound();
  return load(
    `article « ${slug} »`,
    () =>
      serverApi.GET('/api/v1/content/articles/{slug}', {
        params: { path: { slug } },
        fetch: cached(['articles', `article:${slug}`]),
      }),
    { notFoundOn404: true },
  );
}

export function getCateringCatalog() {
  return load('catalogue traiteur', () =>
    serverApi.GET('/api/v1/catering/catalog', { fetch: cached(['catering', 'media']) }),
  );
}

export function getShopProducts() {
  return load('catalogue de la boutique', () =>
    serverApi.GET('/api/v1/shop/products', { fetch: cached(['shop', 'media']) }),
  );
}

export async function getShopProduct(slug: string) {
  if (!SLUG_PATTERN.test(slug)) notFound();
  return load(
    `produit « ${slug} »`,
    () =>
      serverApi.GET('/api/v1/shop/products/{slug}', {
        params: { path: { slug } },
        fetch: cached(['shop', 'media']),
      }),
    { notFoundOn404: true },
  );
}

export function getKitComparison() {
  return load('comparatif des kits', () =>
    serverApi.GET('/api/v1/shop/kits/comparison', { fetch: cached(['shop']) }),
  );
}

export function getPacks() {
  return load('packs de formation', () =>
    serverApi.GET('/api/v1/courses/packs', { fetch: cached(['courses']) }),
  );
}

export function getCourses() {
  return load('formations', () =>
    serverApi.GET('/api/v1/courses', { fetch: cached(['courses', 'media']) }),
  );
}

export async function getCourse(slug: string) {
  if (!SLUG_PATTERN.test(slug)) notFound();
  return load(
    `formation « ${slug} »`,
    () =>
      serverApi.GET('/api/v1/courses/{slug}', {
        params: { path: { slug } },
        fetch: cached(['courses', 'media']),
      }),
    { notFoundOn404: true },
  );
}

/** Vérification publique d'un certificat (numéro imprimé sur le PDF). */
export async function getCertificateVerification(number: string) {
  if (!/^[A-Za-z0-9-]{4,40}$/.test(number)) notFound();
  return load(
    `certificat « ${number} »`,
    () =>
      serverApi.GET('/api/v1/certificates/{number}', {
        params: { path: { number } },
        fetch: cached(['courses']),
      }),
    { notFoundOn404: true },
  );
}
