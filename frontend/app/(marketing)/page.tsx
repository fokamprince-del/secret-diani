import type { Metadata } from 'next';
import { Chiffres } from '@/components/home/Chiffres';
import { DianiWord } from '@/components/home/DianiWord';
import { Etapes } from '@/components/home/Etapes';
import { Hero } from '@/components/home/Hero';
import { Occasions } from '@/components/home/Occasions';
import { Reassurance } from '@/components/home/Reassurance';
import { Reviews } from '@/components/home/Reviews';
import { Saveurs } from '@/components/home/Saveurs';
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

const TITLE = `${SITE_NAME} · Traiteur et pâtisserie faits maison`;

export const metadata: Metadata = {
  ...pageMetadata({
    title: TITLE,
    description:
      'Traiteur et pâtisserie faits maison pour vos mariages, anniversaires, baptêmes et événements d’entreprise : buffets salés, plateaux et layer cakes. Formations et kits pour apprendre.',
    path: '/',
  }),
  title: { absolute: TITLE },
};

/**
 * Accueil, d'après la maquette : hero → bande de réassurance → occasions (mariage, anniversaire…) → bandeau des saveurs → univers (Traiteur et Formations
 * en grandes cartes, Boutique en bandeau) → étapes d’une commande traiteur → incontournables et formations populaires → avis →
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
      <Occasions />
      <Saveurs />
      <Universes universes={home?.universes ?? null} />
      <Etapes />
      <Selections catalog={catalog} courses={courses} packs={packs} />
      <Reviews reviews={reviews} />
      <DianiWord word={home?.dianiWord} />
      <Chiffres catalog={catalog} packs={packs} />
    </>
  );
}
