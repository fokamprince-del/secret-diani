import type { Metadata } from 'next';
import { Chiffres } from '@/components/home/Chiffres';
import { DianiWord } from '@/components/home/DianiWord';
import { Hero } from '@/components/home/Hero';
import { Reassurance } from '@/components/home/Reassurance';
import { Reviews } from '@/components/home/Reviews';
import { Selections } from '@/components/home/Selections';
import { Universes } from '@/components/home/Universes';
import { JsonLd } from '@/components/ui/JsonLd';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import {
  getCateringCatalog,
  getCourses,
  getHomeContent,
  getOrganization,
  getPacks,
  getReviews,
} from '@/lib/api/content';
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
 * Accueil, d'après la maquette : hero → bande de réassurance → univers (Traiteur et Formations
 * en grandes cartes, Boutique en bandeau) → incontournables et formations populaires → avis →
 * mot de Diani → citation et chiffres. Les textes, images, prix et avis viennent de l'API
 * (modifiables sans développeur) ; une section sans contenu n'est pas affichée.
 */
export default async function HomePage() {
  const [home, reviews, organization, catalog, packs, courses] = await Promise.all([
    getHomeContent(),
    getReviews(6),
    getOrganization(),
    getCateringCatalog(),
    getPacks(),
    getCourses(),
  ]);
  const heroImage = home?.heroImage;

  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <JsonLd data={organization} />
      <Hero
        media={
          heroImage ? (
            <ResponsiveImage
              image={heroImage}
              sizes="(min-width: 56rem) 62vw, 100vw"
              priority
              aspectRatio="auto"
            />
          ) : undefined
        }
      />
      <Reassurance />
      <Universes universes={home?.universes ?? null} />
      <Selections catalog={catalog} courses={courses} packs={packs} />
      <Reviews reviews={reviews} />
      <DianiWord word={home?.dianiWord} />
      <Chiffres catalog={catalog} packs={packs} />
    </>
  );
}
