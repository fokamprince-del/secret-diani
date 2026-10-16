import type { CateringCategory, CateringProduct } from '@/lib/api/types';
import { formatPrice } from '@/lib/format';
import { CREATIONS } from '@/lib/vitrine';
import { LoopVideo } from '../ui/LoopVideo';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { ProductOptions } from './ProductOptions';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: CateringProduct;
  kind: CateringCategory['kind'];
}

/** Layer cakes sans photo saisie : trois vrais gâteaux de Diani, le premier filmé. */
function LayerCakeShowcase() {
  const [first, ...others] = CREATIONS.filter((creation) => creation.video).slice(0, 3);
  if (!first) return null;
  return (
    <ul role="list" className={styles.arches}>
      <li>
        <LoopVideo src={first.video!} poster={first.poster} focus={first.focus} />
        <span className="visually-hidden">{first.title}</span>
      </li>
      {others.map((creation) => (
        <li key={creation.slug}>
          <picture>
            <img
              src={creation.poster}
              alt={`Layer cake ${creation.title.toLowerCase()}`}
              width={464}
              height={848}
              loading="lazy"
              decoding="async"
              style={{ objectPosition: creation.focus }}
            />
          </picture>
        </li>
      ))}
    </ul>
  );
}

/**
 * Carte d'un produit traiteur : photo, composition et prix (rendus côté serveur), puis le choix
 * interactif (taille, parfums, contact). Les layer cakes occupent toute la largeur (galerie).
 */
export function ProductCard({ product, kind }: ProductCardProps) {
  const single = product.variants.length === 1 ? product.variants[0] : undefined;
  const wide = kind === 'layer_cake';
  const gallery =
    product.gallery.length > 0 ? product.gallery : product.image ? [product.image] : [];

  // Sans photo (hors layer cakes, qui ont leurs vraies vidéos) : carte texte, sans aplat vide.
  const textOnly = gallery.length === 0 && !wide;

  return (
    <article
      className={`${styles.carte} ${wide ? styles.large : ''}`}
      data-apparition="monte"
      data-sans-photo={textOnly || undefined}
      data-type={kind}
    >
      {!textOnly && (
        <div className={styles.visuels}>
          {gallery.length > 0 ? (
            <ul role="list" className={styles.galerie} data-nombre={Math.min(gallery.length, 3)}>
              {gallery.slice(0, wide ? 3 : 1).map((image, index) => (
                <li key={image.url}>
                  <ResponsiveImage
                    image={image}
                    sizes={
                      wide ? '(min-width: 64rem) 380px, 100vw' : '(min-width: 64rem) 360px, 100vw'
                    }
                    aspectRatio={wide && index > 0 ? '1 / 1' : '4 / 3'}
                    zoomOnHover
                  />
                </li>
              ))}
            </ul>
          ) : (
            <LayerCakeShowcase />
          )}
        </div>
      )}

      {textOnly && (
        <div className={styles.vignette} aria-hidden="true">
          <span className={styles.vignetteNom}>{product.name}</span>
          <span className={styles.vignettePastille}>
            {single ? formatPrice(single.priceCents) : `dès ${formatPrice(product.fromPriceCents)}`}
          </span>
        </div>
      )}

      <div className={styles.texte}>
        <h3 className={styles.nom}>{product.name}</h3>
        {product.description && <p>{product.description}</p>}
        {product.composition.length > 0 && (
          <ul className={styles.composition}>
            {product.composition.map((item) => (
              <li key={item.label}>
                {item.quantity !== null ? `${item.quantity} ${item.label}` : item.label}
              </li>
            ))}
          </ul>
        )}
        <p className={styles.prix}>
          {single ? (
            <>
              <span className={styles.montant}>{formatPrice(single.priceCents)}</span>
              <span className={styles.conditionnement}>{single.label}</span>
            </>
          ) : (
            <span className={styles.conditionnement}>
              À partir de{' '}
              <span className={styles.montant}>{formatPrice(product.fromPriceCents)}</span>
            </span>
          )}
        </p>
        <ProductOptions
          id={product.id}
          name={product.name}
          variants={product.variants}
          flavours={product.flavours}
          maxFlavours={product.maxFlavours}
          whatsappUrl={product.whatsappUrl}
        />
      </div>
    </article>
  );
}
