import type { Metadata } from 'next';
import { Hero } from '@/components/home/Hero';
import { pageMetadata, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = {
  ...pageMetadata({
    title: `${SITE_NAME} · Traiteur, formations et boutique`,
    description:
      'Traiteur, formations et boutique d’accessoires pour créer, apprendre et se faire plaisir.',
    path: '/',
  }),
  title: { absolute: `${SITE_NAME} · Traiteur, formations et boutique` },
};

/** Accueil — socle (phase 1). Les univers, avis et réassurance arrivent en phase 2. */
export default function HomePage() {
  return <Hero />;
}
