import Link from 'next/link';
import type { CateringCatalog, CourseCard, Pack } from '@/lib/api/types';
import { formatPrice, pluralize } from '@/lib/format';
import { BUFFET_PHOTO, BUFFET_VIDEO, CREATIONS, type Creation } from '@/lib/vitrine';
import { Icon } from '../ui/Icon';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { StaticPhoto } from '../ui/StaticPhoto';
import { Rail, type RailItem, type RailTab } from './Rail';

/** Prix court pour les petites cartes : « 15 € » plutôt que « 15,00 € ». */
const shortPrice = (cents: number) => formatPrice(cents).replace(/,00(?=\s*€)/, '');
import styles from './Selections.module.css';

/** Affiche d'une création de Diani (image fixe : les vidéos jouent ailleurs). */
function Poster({ creation }: { creation: Creation }) {
  if (creation.photo) {
    return <StaticPhoto photo={creation.photo} sizes="12rem" focus={creation.focus} decorative />;
  }
  return (
    <picture>
      <img
        src={creation.poster}
        alt=""
        width={464}
        height={848}
        loading="lazy"
        decoding="async"
        style={{ objectPosition: creation.focus }}
      />
    </picture>
  );
}

/** Visuels réels des plateaux, dans l'ordre du catalogue (photo puis vidéo du buffet). */
const PLATEAU_VISUELS = [
  <StaticPhoto key="photo" photo={BUFFET_PHOTO} sizes="12rem" focus="50% 30%" decorative />,
  <picture key="video">
    <img
      src={BUFFET_VIDEO.poster}
      alt=""
      width={464}
      height={848}
      loading="lazy"
      decoding="async"
      style={{ objectPosition: '50% 55%' }}
    />
  </picture>,
];

function cateringTabs(catalog: CateringCatalog | null): RailTab[] {
  const categories = catalog?.categories ?? [];
  const priceOf = (product: CateringCatalog['categories'][number]['products'][number]) =>
    product.variants.length === 1
      ? shortPrice(product.variants[0]!.priceCents)
      : `Dès ${shortPrice(product.fromPriceCents)}`;

  const platters: RailItem[] = categories
    .filter((category) => category.kind === 'platter')
    .flatMap((category) => category.products)
    .map((product, index) => ({
      id: product.id,
      title: product.name,
      meta: product.variants[0]?.label,
      price: priceOf(product),
      href: '/traiteur#plateaux',
      visual: product.image ? (
        <ResponsiveImage image={product.image} sizes="12rem" aspectRatio="4 / 3" />
      ) : (
        PLATEAU_VISUELS[index % PLATEAU_VISUELS.length]
      ),
    }));

  const layerCake = categories
    .filter((category) => category.kind === 'layer_cake')
    .flatMap((category) => category.products)[0];
  const cakes: RailItem[] = CREATIONS.map((creation) => ({
    id: creation.slug,
    title: creation.title,
    meta: creation.slug === 'buches' ? 'Bûches de fête' : 'Layer cake',
    price:
      creation.slug === 'buches' || !layerCake
        ? 'Sur demande'
        : `Dès ${shortPrice(layerCake.fromPriceCents)}`,
    href: creation.slug === 'buches' ? '/traiteur#demande' : '/traiteur#layer-cakes',
    visual: <Poster creation={creation} />,
  }));

  return [
    { label: 'Gâteaux', items: cakes },
    { label: 'Plateaux', items: platters },
  ].filter((tab) => tab.items.length > 0);
}

/** Visuels des packs tant qu'aucune formation n'est publiée : de vrais gâteaux de Diani. */
const PACK_VISUELS = ['mangue-passion', 'framboises', 'caramel-18'].map((slug) =>
  CREATIONS.find((creation) => creation.slug === slug)!,
);

function courseItems(courses: CourseCard[] | null, packs: Pack[] | null): RailItem[] {
  if (courses && courses.length > 0) {
    return courses.slice(0, 8).map((course) => ({
      id: course.id,
      title: course.title,
      meta: pluralize(course.lessonCount, 'leçon', 'leçons'),
      href: `/formations/${course.slug}`,
      visual: course.cover ? (
        <ResponsiveImage image={course.cover} sizes="12rem" aspectRatio="4 / 3" />
      ) : (
        <Poster creation={PACK_VISUELS[0]!} />
      ),
    }));
  }
  return [...(packs ?? [])]
    .sort((a, b) => a.rank - b.rank)
    .map((pack, index) => ({
      id: pack.id,
      title: `Pack ${pack.name}`,
      meta: pluralize(pack.features.length, 'contenu', 'contenus'),
      price: shortPrice(pack.priceCents),
      href: '/formations',
      visual: <Poster creation={PACK_VISUELS[index % PACK_VISUELS.length]!} />,
    }));
}

/**
 * « Nos incontournables » (traiteur) et « Formations populaires », côte à côte comme sur la
 * maquette. Chaque carte mène à la page de son univers, où se fait la commande ou l'achat.
 */
export function Selections({
  catalog,
  courses,
  packs,
}: {
  catalog: CateringCatalog | null;
  courses: CourseCard[] | null;
  packs: Pack[] | null;
}) {
  const tabs = cateringTabs(catalog);
  const formations = courseItems(courses, packs);
  if (tabs.length === 0 && formations.length === 0) return null;

  return (
    <section aria-label="Sélections" className={`conteneur ${styles.selections}`}>
      {tabs.length > 0 && (
        <div className={styles.colonne} data-apparition="monte">
          <div className={styles.entete}>
            <h2 className={styles.titre}>Nos incontournables</h2>
            <Link href="/traiteur" className={styles.toutVoir}>
              Toute la carte
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <Rail tabs={tabs} label="Catégories du traiteur" />
        </div>
      )}
      {formations.length > 0 && (
        <div className={styles.colonne} data-apparition="monte">
          <div className={styles.entete}>
            <h2 className={styles.titre}>Formations populaires</h2>
            <Link href="/formations" className={styles.toutVoir}>
              Toutes les formations
              <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <Rail tabs={[{ label: 'Formations', items: formations }]} label="Formations" />
        </div>
      )}
    </section>
  );
}
