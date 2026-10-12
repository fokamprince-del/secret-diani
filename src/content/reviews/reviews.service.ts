import { Injectable } from '@nestjs/common';
import type { Prisma, ReviewStatus } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentCacheService } from '../cache/content-cache.service';
import { fieldError, notFound } from '../common/content.helpers';
import type { ReviewListDto } from '../common/content-responses.dto';
import type { AdminReviewDto, CreateReviewDto, UpdateReviewDto } from './reviews.dto';

const ADMIN_SELECT = {
  id: true,
  authorName: true,
  rating: true,
  content: true,
  occasion: true,
  receivedOn: true,
  sourceNote: true,
  status: true,
  position: true,
  moderatedAt: true,
  createdAt: true,
} satisfies Prisma.ReviewSelect;

/**
 * Avis clients du traiteur. Saisis par l'administration avec leur provenance et le consentement
 * de la cliente, puis modérés : seuls les avis approuvés sont publics. Toute modification
 * du texte ou de la note d'un avis le renvoie en modération.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
  ) {}

  listPublic(limit = 6): Promise<ReviewListDto> {
    return this.cache.getOrSet(`reviews:${limit}`, async () => {
      const where = { status: 'approved' as const };
      const [rows, stats] = await Promise.all([
        this.prisma.review.findMany({
          where,
          orderBy: [{ position: 'asc' }, { receivedOn: 'desc' }],
          take: limit,
          select: {
            id: true,
            authorName: true,
            rating: true,
            content: true,
            occasion: true,
            receivedOn: true,
          },
        }),
        this.prisma.review.aggregate({ where, _count: true, _avg: { rating: true } }),
      ]);
      return {
        items: rows.map((row) => ({
          ...row,
          receivedOn: row.receivedOn.toISOString().slice(0, 10),
        })),
        count: stats._count,
        average: stats._avg.rating === null ? null : Math.round(stats._avg.rating * 10) / 10,
      };
    });
  }

  listAdmin(status?: ReviewStatus): Promise<AdminReviewDto[]> {
    return this.prisma.review.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { receivedOn: 'desc' }],
      take: 500,
      select: ADMIN_SELECT,
    });
  }

  async create(dto: CreateReviewDto, actorId: string): Promise<AdminReviewDto> {
    const review = await this.prisma.review.create({
      data: {
        authorName: dto.authorName,
        rating: dto.rating,
        content: dto.content,
        occasion: dto.occasion ?? null,
        receivedOn: new Date(dto.receivedOn),
        sourceNote: dto.sourceNote,
        consentConfirmed: dto.consentConfirmed,
        createdById: actorId,
      },
      select: ADMIN_SELECT,
    });
    await this.log(AuditAction.REVIEW_CHANGED, actorId, review.id);
    return review;
  }

  async update(id: string, dto: UpdateReviewDto, actorId: string): Promise<AdminReviewDto> {
    const current = await this.prisma.review.findUnique({ where: { id }, select: ADMIN_SELECT });
    if (!current) throw notFound('Avis introuvable.');
    const substantive =
      (dto.content !== undefined && dto.content !== current.content) ||
      (dto.rating !== undefined && dto.rating !== current.rating) ||
      (dto.authorName !== undefined && dto.authorName !== current.authorName);
    const review = await this.prisma.review.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.receivedOn !== undefined ? { receivedOn: new Date(dto.receivedOn) } : {}),
        ...(substantive ? { status: 'pending', moderatedAt: null, moderatedById: null } : {}),
      },
      select: ADMIN_SELECT,
    });
    if (current.status === 'approved') await this.cache.changed(['reviews']);
    await this.log(AuditAction.REVIEW_CHANGED, actorId, id);
    return review;
  }

  async moderate(
    id: string,
    decision: 'approved' | 'rejected',
    actorId: string,
  ): Promise<AdminReviewDto> {
    const updated = await this.prisma.review.updateMany({
      where: { id },
      data: { status: decision, moderatedAt: new Date(), moderatedById: actorId },
    });
    if (updated.count === 0) throw notFound('Avis introuvable.');
    await this.cache.changed(['reviews']);
    await this.audit.log({
      action: AuditAction.REVIEW_MODERATED,
      actorId,
      targetType: 'review',
      targetId: id,
      metadata: { decision },
    });
    return this.prisma.review.findUniqueOrThrow({ where: { id }, select: ADMIN_SELECT });
  }

  async reorder(ids: string[], actorId: string): Promise<AdminReviewDto[]> {
    const existing = await this.prisma.review.count({ where: { id: { in: ids } } });
    if (existing !== ids.length) throw fieldError('ids', 'contient un avis inconnu');
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.review.update({ where: { id }, data: { position } })),
    );
    await this.cache.changed(['reviews']);
    await this.log(AuditAction.REVIEW_CHANGED, actorId, null);
    return this.listAdmin();
  }

  async remove(id: string, actorId: string): Promise<void> {
    const deleted = await this.prisma.review.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound('Avis introuvable.');
    await this.cache.changed(['reviews']);
    await this.log(AuditAction.REVIEW_CHANGED, actorId, id);
  }

  private log(action: AuditAction, actorId: string, id: string | null): Promise<void> {
    return this.audit.log({ action, actorId, targetType: 'review', targetId: id });
  }
}
