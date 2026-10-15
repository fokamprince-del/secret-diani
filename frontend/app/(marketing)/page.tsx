import type { Metadata } from 'next';
import { DianiWord } from '@/components/home/DianiWord';
import { Etapes } from '@/components/home/Etapes';
import { Hero } from '@/components/home/Hero';
import { Invitation } from '@/components/home/Invitation';
import { Reassurance } from '@/components/home/Reassurance';
import { Reviews } from '@/components/home/Reviews';
import { Saison } from '@/components/home/Saison';
import { Saveurs } from '@/components/home/Saveurs';
import { Universes } from '@/components/home/Universes';
import { Vitrine } from '@/components/home/Vitrine';
import { JsonLd } from '@/components/ui/JsonLd';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { getHomeContent, getOrganization, getReviews, getSiteSettings } from '@/lib/api/content';
import { pageMetadata, SITE_NAME, websiteJsonLd } from '@/lib/seo';
import { socialLinksFrom } from '@/lib/social';

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
 * Accueil : hero (buffet et gâteau) → bandeau des saveurs → trois univers → vitrine des gâteaux
 * → saison des fêtes → étapes d'une commande → avis → mot de Diani → réassurance → invitation
 * (ordre du cahier, enrichi : D-F48, D-F50). Les textes, images et avis viennent de l'API (modifiables sans
 * développeur) ; une section sans contenu n'est pas affichée.
 */
export default async function HomePage() {
  const [home, reviews, organization, settings] = await Promise.all([
    getHomeContent(),
    getReviews(6),
    getOrganization(),
    getSiteSettings(),
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
      <Saveurs />
      <Universes universes={home?.universes ?? null} />
      <Vitrine />
      <Saison />
      <Etapes />
      <Reviews reviews={reviews} />
      <DianiWord word={home?.dianiWord} />
      <Reassurance />
      <Invitation social={socialLinksFrom(settings)[0] ?? null} />
    </>
  );
}
