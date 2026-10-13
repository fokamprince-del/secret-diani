import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { IMMUTABLE_CACHE_CONTROL, StorageService } from '../storage/storage.service';
import { ClamavClient } from './clamav.client';
import { detectFileType, MAX_BYTES, unsupportedTypeMessage } from './file-signature';
import { processImage } from './image-pipeline';
import { type StoredVariant, storedVariants } from './media.types';

export type ProcessingOutcome = 'ready' | 'rejected' | 'skipped';

/**
 * Traitement d'un fichier reçu (worker) :
 * taille → type réel (octets magiques) → antivirus → ré-encodage des images (sans EXIF)
 * → publication des variantes → suppression de l'original des images.
 */
@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);
  private readonly antivirus: ClamavClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: AppConfigService,
  ) {
    const host = config.get('CLAMAV_HOST');
    this.antivirus = host ? new ClamavClient(host, config.get('CLAMAV_PORT')) : null;
    if (!this.antivirus) {
      this.logger.warn('Antivirus non configuré (CLAMAV_HOST) : fichiers non analysés.');
    }
  }

  async process(mediaId: string): Promise<ProcessingOutcome> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.deletedAt || media.status === 'ready' || media.status === 'rejected') {
      return 'skipped';
    }
    const maxBytes = MAX_BYTES[media.kind];

    const size = await this.storage.size('private', media.storageKey);
    if (size === null) return this.reject(mediaId, 'Fichier non reçu.');
    if (size === 0 || size > maxBytes) {
      return this.reject(
        mediaId,
        `Fichier vide ou trop volumineux (maximum ${maxBytes / 1024 / 1024} Mo).`,
      );
    }
    const buffer = await this.storage.read('private', media.storageKey, maxBytes);

    const detected = detectFileType(buffer);
    if (!detected) return this.reject(mediaId, unsupportedTypeMessage(buffer));
    if (detected.kind !== media.kind) {
      return this.reject(mediaId, 'Le contenu du fichier ne correspond pas au type annoncé.');
    }

    let scanResult = 'skipped';
    if (this.antivirus) {
      const verdict = await this.antivirus.scan(buffer);
      if (!verdict.clean) {
        this.logger.warn({ mediaId, signature: verdict.signature }, 'Fichier infecté refusé');
        return this.reject(mediaId, 'Fichier refusé par l’analyse antivirus.');
      }
      scanResult = 'clean';
    }

    const common = {
      mimeType: detected.mime,
      sizeBytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      scanResult,
    };

    if (media.kind === 'document') {
      await this.prisma.media.update({
        where: { id: mediaId },
        data: { ...common, status: 'ready' },
      });
      return 'ready';
    }

    let processed: Awaited<ReturnType<typeof processImage>>;
    try {
      processed = await processImage(buffer);
    } catch {
      return this.reject(mediaId, 'Image illisible ou corrompue.');
    }

    const variants: StoredVariant[] = [];
    for (const variant of processed.variants) {
      const key = `media/${mediaId}/${variant.width}.${variant.format}`;
      await this.storage.put(
        'public',
        key,
        variant.buffer,
        `image/${variant.format}`,
        IMMUTABLE_CACHE_CONTROL,
      );
      variants.push({
        format: variant.format,
        width: variant.width,
        height: variant.height,
        key,
        url: this.storage.publicUrl(key),
        bytes: variant.buffer.length,
      });
    }

    await this.prisma.media.update({
      where: { id: mediaId },
      data: {
        ...common,
        status: 'ready',
        width: processed.width,
        height: processed.height,
        variants: variants as unknown as Prisma.InputJsonValue,
        blurDataUrl: processed.blurDataUrl,
      },
    });
    // L'original peut contenir des métadonnées (position GPS…) : il n'est pas conservé.
    await this.storage.remove('private', [media.storageKey]);
    return 'ready';
  }

  /** Refus définitif : l'original est supprimé, la raison est affichée dans l'administration. */
  async reject(mediaId: string, reason: string): Promise<'rejected'> {
    const media = await this.prisma.media.update({
      where: { id: mediaId },
      data: { status: 'rejected', rejectionReason: reason.slice(0, 300) },
      select: { storageKey: true },
    });
    await this.storage.remove('private', [media.storageKey]);
    return 'rejected';
  }

  /** Suppression des fichiers d'un média supprimé (variantes publiques et original). */
  async purgeFiles(mediaId: string): Promise<void> {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { storageKey: true, variants: true, deletedAt: true },
    });
    if (!media?.deletedAt) return;
    await this.storage.remove(
      'public',
      storedVariants(media).map((variant) => variant.key),
    );
    await this.storage.remove('private', [media.storageKey]);
    await this.prisma.media.update({
      where: { id: mediaId },
      data: { variants: [] },
    });
  }
}
