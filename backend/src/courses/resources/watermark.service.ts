import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable } from '@nestjs/common';
import { degrees, PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import type { Queue } from 'bullmq';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { notFound } from '../../content/common/content.helpers';
import { MAX_BYTES } from '../../media/file-signature';
import { PrismaService } from '../../prisma/prisma.service';
import { DOCUMENTS_QUEUE, type DocumentJobData } from '../../shop/shop.constants';
import { StorageService } from '../../storage/storage.service';

/** Copie filigranée propre à une cliente et à une version du fichier (nouveau fichier → nouvelle copie). */
function watermarkedKey(mediaId: string, userId: string): string {
  return `watermarked/${mediaId}/${userId}.pdf`;
}

/** Texte du filigrane : identité de la cliente, dissuasif contre le partage de la fiche. */
export function watermarkText(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return name ? `${name} — ${user.email}` : user.email;
}

/** Appose le filigrane sur chaque page (diagonale discrète + mention en pied de page). */
export async function stampPdf(original: Buffer, text: string): Promise<Buffer> {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(Math.min(width / 22, 28), 12);
    page.drawText(text, {
      x: width * 0.12,
      y: height * 0.3,
      size,
      font,
      color: rgb(0.61, 0.38, 0.33),
      opacity: 0.12,
      rotate: degrees(35),
    });
    page.drawText(`Usage personnel — ${text}`, {
      x: 24,
      y: 14,
      size: 7,
      font,
      color: rgb(0.48, 0.42, 0.39),
      opacity: 0.8,
    });
  }
  return Buffer.from(await pdf.save());
}

/**
 * Fiches PDF filigranées au nom de la cliente : produites une fois par le worker, stockées dans
 * le bucket privé, puis servies par URL signée. Tant que la copie n'est pas prête, la cliente
 * reçoit « en préparation » (409) et réessaie.
 */
@Injectable()
export class WatermarkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(DOCUMENTS_QUEUE) private readonly documents: Queue<DocumentJobData>,
  ) {}

  async downloadUrl(
    resourceId: string,
    userId: string,
    filename: string,
  ): Promise<{ url: string }> {
    const resource = await this.prisma.lessonResource.findUnique({
      where: { id: resourceId },
      select: { mediaId: true },
    });
    if (!resource) throw notFound('Fiche introuvable.');
    const key = watermarkedKey(resource.mediaId, userId);
    if ((await this.storage.size('private', key)) !== null) {
      return { url: await this.storage.presignDownload(key, filename) };
    }
    await this.documents.add(
      'watermark-pdf',
      { resourceId, userId },
      { jobId: `watermark-${resource.mediaId}-${userId}`, removeOnFail: true },
    );
    throw new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.DOCUMENT_NOT_READY,
      'Votre fiche personnalisée est en préparation. Merci de réessayer dans quelques secondes.',
    );
  }

  /** Worker : produit et stocke la copie filigranée (idempotent). */
  async render(resourceId: string, userId: string): Promise<void> {
    const [resource, user] = await Promise.all([
      this.prisma.lessonResource.findUnique({
        where: { id: resourceId },
        select: { mediaId: true, media: { select: { storageKey: true } } },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      }),
    ]);
    if (!resource || !user) return;
    const key = watermarkedKey(resource.mediaId, userId);
    if ((await this.storage.size('private', key)) !== null) return;
    const original = await this.storage.read(
      'private',
      resource.media.storageKey,
      MAX_BYTES.document,
    );
    await this.storage.put(
      'private',
      key,
      await stampPdf(original, watermarkText(user)),
      'application/pdf',
    );
  }
}
