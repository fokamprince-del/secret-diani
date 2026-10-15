import Link from 'next/link';
import type { ShopProductCard } from '@/lib/api/types';
import { formatPrice } from '@/lib/format';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { AvailabilityBadge } from './AvailabilityBadge';
import styles from './ProductCard.module.css';

/** Carte d'un kit ou d'un accessoire : la carte entière mène à la fiche. */
export function ProductCard({
  product,
  headingLevel = 3,
}: {
  product: ShopProductCard;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className={styles.carte} data-apparition="monte">
      <div className={styles.visuel}>
        {product.image ? (
          <ResponsiveImage
            image={product.image}
            sizes="(min-width: 64rem) 360px, (min-width: 40rem) 45vw, 100vw"
            aspectRatio="1 / 1"
            zoomOnHover
          />
        ) : (
          <div className={styles.aplat} aria-hidden="true" />
        )}
      </div>
      <div className={styles.texte}>
        <Heading className={styles.nom}>
          <Link href={`/boutique/${product.slug}`} className={styles.lien}>
            {product.name}
          </Link>
        </Heading>
        {product.shortDescription && <p>{product.shortDescription}</p>}
        <p className={styles.prix}>
          {product.kind === 'accessory' ? 'À partir de ' : ''}
          <span className={styles.montant}>{formatPrice(product.fromPriceCents)}</span>
        </p>
        <AvailabilityBadge availability={product.availability} />
      </div>
    </article>
  );
}
