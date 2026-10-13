import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { Media, MediaKind } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { type CursorPage, toCursorPage } from '../common/pagination/cursor';
import { uuidv7 } from '../common/utils/uuid';
import { ContentCacheService } from '../content/cache/content-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { CreateUploadDto, MediaDto, MediaQueryDto, PresignedUploadDto } from './dto/media.dto';
import {
  ACCEPTED_TYPES,
  detectFileType,
  MAX_BYTES,
  unsupportedTypeMessage,
} from './file-signature';
import { MEDIA_JOB, MEDIA_QUEUE, type MediaJobData, storedVariants } from './media.types';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Média introuvable.');
}

function tooLarge(kind: MediaKind): AppException {
  return new AppException(
    HttpStatus.PAYLOAD_TOO_LARGE,
    ErrorCode.PAYLOAD_TOO_LARGE,
    `Fichier trop volumineux (maximum ${MAX_BYTES[kind] / 1024 / 1024} Mo).`,
  );
}

/** Nom d'origine nettoyé : affichage dans l'administration uniquement, jamais utilisé comme chemin. */
function cleanName(name: string): string {
  return (
    name
      .replace(/[\\/]/g, '_')
      .replace(/[^\p{L}\p{N} ._()-]/gu, '')
      .trim()
      .slice(0, 255) || 'fichier'
  );
}

/** Médiathèque (administration). Le traitement lourd (contrôles, variantes) est fait par le worker. */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly cache: ContentCacheService,
    @InjectQueue(MEDIA_QUEUE) private readonly queue: Queue<MediaJobData>,
  ) {}

  /** Envoi par l'API (multipart) : le type réel est vérifié avant tout stockage. */
  async upload(file: UploadedFile, alt: string | undefined, actorId: string): Promise<MediaDto> {
    const detected = detectFileType(file.buffer);
    if (!detected) {
      throw new AppException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        unsupportedTypeMessage(file.buffer),
      );
    }
    if (file.buffer.length > MAX_BYTES[detected.kind]) throw tooLarge(detected.kind);

    const id = uuidv7();
    const storageKey = `originals/${id}`;
    await this.storage.put('private', storageKey, file.buffer, detected.mime);
    const media = await this.prisma.media.create({
      data: {
        id,
        kind: detected.kind,
        status: 'processing',
        originalName: cleanName(file.originalname),
        storageKey,
        alt: alt ?? '',
        uploadedById: actorId,
      },
    });
    await this.enqueueProcessing(media.id);
    await this.audit.log({
      action: AuditAction.MEDIA_UPLOADED,
      actorId,
      targetType: 'media',
      targetId: media.id,
      metadata: { kind: media.kind, via: 'api' },
    });
    return this.toDto(media);
  }

  /** Envoi direct au stockage (gros fichiers) : réserve un emplacement et signe l'URL d'envoi. */
  async createUpload(dto: CreateUploadDto, actorId: string): Promise<PresignedUploadDto> {
    const accepted = ACCEPTED_TYPES[dto.contentType]!;
    if (dto.size > MAX_BYTES[accepted.kind]) throw tooLarge(accepted.kind);
    const id = uuidv7();
    const storageKey = `originals/${id}`;
    const media = await this.prisma.media.create({
      data: {
        id,
        kind: accepted.kind,
        status: 'pending',
        originalName: cleanName(dto.filename),
        storageKey,
        alt: dto.alt ?? '',
        uploadedById: actorId,
      },
    });
    const uploadUrl = await this.storage.presignUpload(storageKey, accepted.mime, dto.size);
    return {
      media: this.toDto(media),
      uploadUrl,
      headers: { 'Content-Type': accepted.mime },
    };
  }

  /** Après l'envoi direct : lance les contrôles et le traitement. */
  async completeUpload(id: string, actorId: string): Promise<MediaDto> {
    const updated = await this.prisma.media.updateMany({
      where: { id, status: 'pending', deletedAt: null },
      data: { status: 'processing' },
    });
    if (updated.count !== 1) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Cet envoi est déjà terminé ou n’existe pas.',
      );
    }
    await this.enqueueProcessing(id);
    await this.audit.log({
      action: AuditAction.MEDIA_UPLOADED,
      actorId,
      targetType: 'media',
      targetId: id,
      metadata: { via: 'presigned' },
    });
    return this.get(id);
  }

  async list(query: MediaQueryDto): Promise<CursorPage<MediaDto>> {
    const limit = query.limit ?? 30;
    const rows = await this.prisma.media.findMany({
      where: {
        deletedAt: null,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = toCursorPage(rows, limit);
    return { items: page.items.map((media) => this.toDto(media)), nextCursor: page.nextCursor };
  }

  async get(id: string): Promise<MediaDto> {
    const media = await this.prisma.media.findFirst({ where: { id, deletedAt: null } });
    if (!media) throw notFound();
    return this.toDto(media);
  }

  async updateAlt(id: string, alt: string, actorId: string): Promise<MediaDto> {
    const updated = await this.prisma.media.updateMany({
      where: { id, deletedAt: null },
      data: { alt },
    });
    if (updated.count !== 1) throw notFound();
    await this.cache.changed(['media']);
    await this.audit.log({
      action: AuditAction.MEDIA_UPDATED,
      actorId,
      targetType: 'media',
      targetId: id,
    });
    return this.get(id);
  }

  /** URL de téléchargement signée et courte (documents privés uniquement). */
  async downloadUrl(id: string): Promise<{ url: string }> {
    const media = await this.prisma.media.findFirst({
      where: { id, deletedAt: null, kind: 'document', status: 'ready' },
      select: { storageKey: true, originalName: true },
    });
    if (!media) throw notFound();
    return { url: await this.storage.presignDownload(media.storageKey, media.originalName) };
  }

  /** Suppression : refusée si le média est utilisé ; fichiers effacés ensuite par le worker. */
  async remove(id: string, actorId: string): Promise<void> {
    const media = await this.prisma.media.findFirst({
      where: { id, deletedAt: null },
      select: { _count: { select: { articleCovers: { where: { deletedAt: null } } } } },
    });
    if (!media) throw notFound();
    if (media._count.articleCovers > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Ce média est utilisé par un article. Remplacez-le avant de le supprimer.',
      );
    }
    await this.prisma.media.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.queue.add(MEDIA_JOB.purge, { mediaId: id });
    await this.cache.changed(['media']);
    await this.audit.log({
      action: AuditAction.MEDIA_DELETED,
      actorId,
      targetType: 'media',
      targetId: id,
    });
  }

  private enqueueProcessing(mediaId: string): Promise<unknown> {
    return this.queue.add(MEDIA_JOB.process, { mediaId }, { jobId: `process-${mediaId}` });
  }

  toDto(media: Media): MediaDto {
    return {
      id: media.id,
      kind: media.kind,
      status: media.status,
      originalName: media.originalName,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      width: media.width,
      height: media.height,
      alt: media.alt,
      variants: storedVariants(media).map(({ format, width, url }) => ({ format, width, url })),
      blurDataUrl: media.blurDataUrl,
      rejectionReason: media.rejectionReason,
      scanResult: media.scanResult,
      createdAt: media.createdAt,
    };
  }
}
