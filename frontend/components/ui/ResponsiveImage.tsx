import type { components } from '@/lib/api/schema';
import styles from './ResponsiveImage.module.css';

export type PublicImage = components['schemas']['PublicImageDto'];

interface ResponsiveImageProps {
  image: PublicImage;
  /** Largeur d'affichage selon le viewport, ex. « (min-width: 64rem) 50vw, 100vw ». */
  sizes: string;
  /** Uniquement pour l'image du hero : chargement prioritaire. */
  priority?: boolean;
  /** Ratio imposé (« 4 / 5 ») ; par défaut celui de l'image. */
  aspectRatio?: string;
  className?: string;
  /** Zoom léger au survol d'une carte ou d'un bandeau. */
  zoomOnHover?: boolean;
}

const srcSet = (sources: { url: string; width: number }[]) =>
  sources.map((source) => `${source.url} ${source.width}w`).join(', ');

/**
 * Image fournie par l'API, déjà déclinée en AVIF/WebP à plusieurs largeurs avec un aperçu flou.
 * On la sert telle quelle via `<picture>` : la ré-optimiser avec `next/image` doublerait le
 * travail et le stockage (voir DECISIONS D-F07). Le ratio est réservé : aucun décalage (CLS).
 */
export function ResponsiveImage({
  image,
  sizes,
  priority = false,
  aspectRatio,
  className,
  zoomOnHover = false,
}: ResponsiveImageProps) {
  const ratio = aspectRatio ?? `${image.width} / ${image.height}`;
  return (
    <div
      className={[styles.cadre, zoomOnHover && styles.zoom, className].filter(Boolean).join(' ')}
      style={{
        aspectRatio: ratio,
        backgroundImage: image.blurDataUrl ? `url("${image.blurDataUrl}")` : undefined,
      }}
    >
      <picture>
        {image.sources.avif.length > 0 && (
          <source type="image/avif" srcSet={srcSet(image.sources.avif)} sizes={sizes} />
        )}
        {image.sources.webp.length > 0 && (
          <source type="image/webp" srcSet={srcSet(image.sources.webp)} sizes={sizes} />
        )}
        {/* <img> natif : variantes déjà optimisées par l'API (pas de next/image). */}
        <img
          src={image.url}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding={priority ? 'sync' : 'async'}
          className={styles.image}
        />
      </picture>
    </div>
  );
}
