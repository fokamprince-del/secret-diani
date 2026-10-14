import type { Metadata } from 'next';
import { siteUrl } from './env';

export const SITE_NAME = 'Les Secrets de Diani';

const DEFAULT_SHARE_IMAGE = {
  url: siteUrl('/opengraph-image'),
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} : traiteur, formations et boutique`,
};

interface PageMetadataInput {
  title: string;
  description: string;
  /** Chemin de la page (« /traiteur ») : sert d'URL canonique. */
  path: string;
  image?: { url: string; width: number; height: number; alt: string } | null;
  /** Pages membres, tunnel de commande, recherche : jamais indexées. */
  noindex?: boolean;
  type?: 'website' | 'article';
}

/** Métadonnées uniques par page : titre, description, canonique, Open Graph et Twitter. */
export function pageMetadata({
  title,
  description,
  path,
  image,
  noindex = false,
  type = 'website',
}: PageMetadataInput): Metadata {
  const url = siteUrl(path);
  // Sans visuel propre, l'image de partage par défaut (app/opengraph-image.tsx) : déclarer
  // `openGraph` dans une page remplace sinon celle héritée du gabarit.
  const images = [image ?? DEFAULT_SHARE_IMAGE];
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: SITE_NAME,
      locale: 'fr_FR',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [images[0]!.url],
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}

/** Pages privées : ni indexées ni suivies, sans canonique. */
export const privateMetadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Fil d'Ariane en données structurées (BreadcrumbList) : les moteurs l'affichent sous le titre.
 * Chemins internes ; l'accueil est ajouté en tête.
 */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  const trail = [{ name: 'Accueil', path: '/' }, ...items];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: siteUrl(item.path),
    })),
  };
}

/** Site (WebSite) : nom et adresse officiels, sur l'accueil. */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: siteUrl('/'),
    inLanguage: 'fr-FR',
  };
}
