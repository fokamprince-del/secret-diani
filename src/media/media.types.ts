import type { Media } from '@prisma/client';
import type { VariantFormat } from './image-pipeline';

export const MEDIA_QUEUE = 'media';
export const MEDIA_JOB = { process: 'process', purge: 'purge' } as const;

export interface MediaJobData {
  mediaId: string;
}

/** Variante telle que stockée dans `media.variants`. */
export interface StoredVariant {
  format: VariantFormat;
  width: number;
  height: number;
  key: string;
  url: string;
  bytes: number;
}

/** Image prête à afficher (frontend : <picture> + srcset, placeholder flou, ratio réservé). */
export interface PublicImage {
  alt: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
  sources: Record<VariantFormat, { url: string; width: number }[]>;
  /** Plus grande variante WebP (balise <img> de repli, Open Graph). */
  url: string;
}

export function storedVariants(media: Pick<Media, 'variants'>): StoredVariant[] {
  return Array.isArray(media.variants) ? (media.variants as unknown as StoredVariant[]) : [];
}

/** Vue publique d'une image prête ; null si absente, non prête ou supprimée. */
export function toPublicImage(
  media: Pick<
    Media,
    'status' | 'kind' | 'deletedAt' | 'variants' | 'width' | 'height' | 'blurDataUrl' | 'alt'
  > | null,
  alt?: string,
): PublicImage | null {
  if (!media || media.status !== 'ready' || media.kind !== 'image' || media.deletedAt) return null;
  const variants = storedVariants(media);
  const byFormat = (format: VariantFormat) =>
    variants
      .filter((variant) => variant.format === format)
      .sort((a, b) => a.width - b.width)
      .map(({ url, width }) => ({ url, width }));
  const webp = byFormat('webp');
  return {
    alt: alt ?? media.alt,
    width: media.width ?? 0,
    height: media.height ?? 0,
    blurDataUrl: media.blurDataUrl,
    sources: { avif: byFormat('avif'), webp },
    url: webp.at(-1)?.url ?? '',
  };
}

/** Champs nécessaires à `toPublicImage` (select Prisma). */
export const PUBLIC_IMAGE_SELECT = {
  status: true,
  kind: true,
  deletedAt: true,
  variants: true,
  width: true,
  height: true,
  blurDataUrl: true,
  alt: true,
} as const;
