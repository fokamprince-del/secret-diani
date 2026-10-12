import { Injectable } from '@nestjs/common';
import type { FaqCategory, Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentCacheService } from '../cache/content-cache.service';
import { fieldError, notFound } from '../common/content.helpers';
import type { FaqListDto } from '../common/content-responses.dto';
import { MarkdownService } from '../markdown/markdown.service';
import type { AdminFaqDto, CreateFaqDto, UpdateFaqDto } from './faq.dto';

const ADMIN_SELECT = {
  id: true,
  category: true,
  question: true,
  answerMarkdown: true,
  answerHtml: true,
  position: true,
  published: true,
} satisfies Prisma.FaqSelect;

@Injectable()
export class FaqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markdown: MarkdownService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
  ) {}

  listPublic(category?: FaqCategory): Promise<FaqListDto> {
    return this.cache.getOrSet(`faq:${category ?? '*'}`, async () => {
      const items = await this.prisma.faq.findMany({
        where: { published: true, ...(category ? { category } : {}) },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true, category: true, question: true, answerHtml: true },
      });
      return {
        items,
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: items.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: item.answerHtml },
          })),
        },
      };
    });
  }

  listAdmin(): Promise<AdminFaqDto[]> {
    return this.prisma.faq.findMany({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: ADMIN_SELECT,
    });
  }

  async create(dto: CreateFaqDto, actorId: string): Promise<AdminFaqDto> {
    const last = await this.prisma.faq.aggregate({ _max: { position: true } });
    const faq = await this.prisma.faq.create({
      data: {
        category: dto.category,
        question: dto.question,
        answerMarkdown: dto.answerMarkdown,
        answerHtml: this.markdown.render(dto.answerMarkdown).html,
        published: dto.published ?? true,
        position: (last._max.position ?? -1) + 1,
      },
      select: ADMIN_SELECT,
    });
    await this.changed(actorId, faq.id);
    return faq;
  }

  async update(id: string, dto: UpdateFaqDto, actorId: string): Promise<AdminFaqDto> {
    const updated = await this.prisma.faq.updateMany({
      where: { id },
      data: {
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.question !== undefined ? { question: dto.question } : {}),
        ...(dto.published !== undefined ? { published: dto.published } : {}),
        ...(dto.answerMarkdown !== undefined
          ? {
              answerMarkdown: dto.answerMarkdown,
              answerHtml: this.markdown.render(dto.answerMarkdown).html,
            }
          : {}),
      },
    });
    if (updated.count === 0) throw notFound('Question introuvable.');
    await this.changed(actorId, id);
    return this.prisma.faq.findUniqueOrThrow({ where: { id }, select: ADMIN_SELECT });
  }

  async remove(id: string, actorId: string): Promise<void> {
    const deleted = await this.prisma.faq.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound('Question introuvable.');
    await this.changed(actorId, id);
  }

  /** Glisser-déposer : la position suit l'ordre de la liste reçue. */
  async reorder(ids: string[], actorId: string): Promise<AdminFaqDto[]> {
    const existing = await this.prisma.faq.count({ where: { id: { in: ids } } });
    if (existing !== ids.length) throw fieldError('ids', 'contient une question inconnue');
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.faq.update({ where: { id }, data: { position } })),
    );
    await this.changed(actorId, null);
    return this.listAdmin();
  }

  private async changed(actorId: string, id: string | null): Promise<void> {
    await this.cache.changed(['faq']);
    await this.audit.log({
      action: AuditAction.FAQ_CHANGED,
      actorId,
      targetType: 'faq',
      targetId: id,
    });
  }
}
