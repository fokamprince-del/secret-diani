import type { CSSProperties } from 'react';
import type { Photo } from '@/lib/vitrine';

interface StaticPhotoProps {
  photo: Photo;
  /** Largeur d'affichage selon le viewport (attribut `sizes`). */
  sizes: string;
  /** Cadrage (`object-position`). */
  focus?: string;
  /** Décorative (texte voisin équivalent) : alternative vide. */
  decorative?: boolean;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Photo statique de `public/media` : AVIF, puis WebP, puis JPEG. */
export function StaticPhoto({
  photo,
  sizes,
  focus,
  decorative = false,
  priority = false,
  className,
  style,
}: StaticPhotoProps) {
  return (
    <picture className={className} style={style}>
      <source type="image/avif" srcSet={photo.avif} sizes={sizes} />
      <source type="image/webp" srcSet={photo.webp} sizes={sizes} />
      <img
        src={photo.fallback}
        alt={decorative ? '' : photo.alt}
        width={photo.width}
        height={photo.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        style={focus ? { objectPosition: focus } : undefined}
      />
    </picture>
  );
}
