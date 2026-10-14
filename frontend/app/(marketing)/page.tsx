import type { Metadata } from 'next';
import { DianiWord } from '@/components/home/DianiWord';
import { Hero } from '@/components/home/Hero';
import { Reassurance } from '@/components/home/Reassurance';
import { Reviews } from '@/components/home/Reviews';
import { Universes } from '@/components/home/Universes';
import { JsonLd } from '@/components/ui/JsonLd';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { getHomeContent, getOrganization, getReviews } from '@/lib/api/content';
import { pageMetadata, SITE_NAME, websiteJsonLd } from '@/lib/seo';

const TITLE = `${SITE_NAME} · Traiteur, formations et boutique`;

export const metadata: Metadata = {
  ...pageMetadata({
    title: TITLE,
    description:
      'Traiteur, formations et boutique d’accessoires pour créer, apprendre et se faire plaisir.',
    path: '/',
  }),
  title: { absolute: TITLE },
};

/**
 * Accueil, dans l'ordre imposé : hero d'ambiance → trois univers → avis traiteur → mot de
 * Diani → réassurance. Les textes, images et avis viennent de l'API (modifiables sans
 * développeur) ; une section sans contenu n'est pas affichée.
 */
export default async function HomePage() {
  const [home, reviews, organization] = await Promise.all([
    getHomeContent(),
    getReviews(6),
    getOrganization(),
  ]);
  const heroImage = home?.heroImage;

  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={organization} />
      <Hero
        media={
          heroImage ? (
            <ResponsiveImage image={heroImage} sizes="100vw" priority aspectRatio="auto" />
          ) : undefined
        }
      />
      <Universes universes={home?.universes ?? null} />
      <Reviews reviews={reviews} />
      <DianiWord word={home?.dianiWord} />
      <Reassurance />
    </>
  );
}
