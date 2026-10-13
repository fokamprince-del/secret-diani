import sharp from 'sharp';

/** Largeurs générées (srcset) : du mobile au plein écran. Jamais d'agrandissement. */
export const VARIANT_WIDTHS = [320, 640, 960, 1280, 1920] as const;
export type VariantFormat = 'avif' | 'webp';

export interface ImageVariant {
  format: VariantFormat;
  width: number;
  height: number;
  buffer: Buffer;
}

export interface ProcessedImage {
  width: number;
  height: number;
  variants: ImageVariant[];
  blurDataUrl: string;
}

/** Protection contre les « bombes de décompression » (image minuscule déclarant 100 000 × 100 000 px). */
const MAX_INPUT_PIXELS = 50_000_000;

function widthsFor(originalWidth: number): number[] {
  const widths = VARIANT_WIDTHS.filter((width) => width < originalWidth);
  return [...widths, Math.min(originalWidth, VARIANT_WIDTHS.at(-1)!)];
}

/**
 * Ré-encode une image : orientation appliquée, métadonnées (EXIF, GPS, ICC) supprimées,
 * variantes AVIF et WebP aux largeurs utiles, aperçu flou de quelques octets.
 * Le fichier d'origine n'est jamais servi : seuls ces ré-encodages sont publiés.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate();
  const { info } = await base.clone().toBuffer({ resolveWithObject: true });

  const variants: ImageVariant[] = [];
  for (const width of [...new Set(widthsFor(info.width))]) {
    const resized = base.clone().resize({ width, withoutEnlargement: true });
    const [avif, webp] = await Promise.all([
      resized.clone().avif({ quality: 55, effort: 4 }).toBuffer({ resolveWithObject: true }),
      resized.clone().webp({ quality: 80 }).toBuffer({ resolveWithObject: true }),
    ]);
    variants.push(
      { format: 'avif', width: avif.info.width, height: avif.info.height, buffer: avif.data },
      { format: 'webp', width: webp.info.width, height: webp.info.height, buffer: webp.data },
    );
  }

  const blur = await base.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return {
    width: info.width,
    height: info.height,
    variants,
    blurDataUrl: `data:image/webp;base64,${blur.toString('base64')}`,
  };
}
