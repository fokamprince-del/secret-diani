import type { Metadata } from 'next';
import { siteUrl } from './env';

export const SITE_NAME = 'Les Secrets de Diani';

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
  const images = image ? [image] : undefined;
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
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image.url] : undefined,
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}

/** Pages privées : ni indexées ni suivies, sans canonique. */
export const privateMetadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
