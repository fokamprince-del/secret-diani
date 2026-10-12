import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PUBLIC_IMAGE_SELECT, toPublicImage } from '../../media/media.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentCacheService } from '../cache/content-cache.service';
import { fieldError, notFound } from '../common/content.helpers';
import type {
  ArticleCardDto,
  ArticleDetailDto,
  ArticleListDto,
} from '../common/content-responses.dto';
import { SiteInfoService } from '../common/site-info.service';
import { MarkdownService, type TocEntry } from '../markdown/markdown.service';
import { slugify } from '../markdown/slug';
import type {
  AdminArticleQueryDto,
  CreateArticleDto,
  PublicArticleQueryDto,
  UpdateArticleDto,
} from './dto/article.dto';

export type ArticleState = 'draft' | 'scheduled' | 'published';

export type PublicArticleResult =
  { kind: 'article'; article: ArticleDetailDto } | { kind: 'redirect'; slug: string };

const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  readingMinutes: true,
  publishedAt: true,
  coverAlt: true,
  coverMedia: { select: PUBLIC_IMAGE_SELECT },
  category: { select: { slug: true, name: true } },
} satisfies Prisma.ArticleSelect;

type CardRecord = Prisma.ArticleGetPayload<{ select: typeof CARD_SELECT }>;

const ADMIN_SELECT = {
  ...CARD_SELECT,
  status: true,
  bodyMarkdown: true,
  categoryId: true,
  coverMediaId: true,
  seoTitle: true,
  seoDescription: true,
  relatedCourseSlug: true,
  previousSlugs: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ArticleSelect;

type AdminRecord = Prisma.ArticleGetPayload<{ select: typeof ADMIN_SELECT }>;

export type AdminArticle = Omit<AdminRecord, 'coverMedia' | 'coverAlt'> & {
  state: ArticleState;
  cover: ArticleCardDto['cover'];
  coverAlt: string;
};

/** Visibilité publique : publié, date de publication atteinte, non supprimé. */
function visibleWhere(now = new Date()): Prisma.ArticleWhereInput {
  return { deletedAt: null, status: 'published', publishedAt: { lte: now } };
}

export function articleState(
  article: { status: string; publishedAt: Date | null },
  now = new Date(),
): ArticleState {
  if (article.status !== 'published' || !article.publishedAt) return 'draft';
  return article.publishedAt > now ? 'scheduled' : 'published';
}

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markdown: MarkdownService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
    private readonly site: SiteInfoService,
  ) {}

  // ---------------------------------------------------------------------------
  // Lecture publique (mise en cache)
  // ---------------------------------------------------------------------------

  listPublic(query: PublicArticleQueryDto): Promise<ArticleListDto> {
    const limit = query.limit ?? 12;
    const key = `articles:list:${query.category ?? '*'}:${query.cursor ?? '0'}:${limit}`;
    return this.cache.getOrSet(key, async () => {
      const rows = await this.prisma.article.findMany({
        where: {
          ...visibleWhere(),
          ...(query.category ? { category: { slug: query.category } } : {}),
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        take: limit + 1,
        select: CARD_SELECT,
      });
      const items = rows.slice(0, limit).map((row) => this.toCard(row));
      return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
    });
  }

  async getPublic(slug: string): Promise<PublicArticleResult> {
    return this.cache.getOrSet(`article:${slug}`, async () => {
      const article = await this.prisma.article.findFirst({
        where: { ...visibleWhere(), slug },
        select: {
          ...CARD_SELECT,
          bodyHtml: true,
          toc: true,
          updatedAt: true,
          seoTitle: true,
          seoDescription: true,
          relatedCourseSlug: true,
          categoryId: true,
        },
      });
      if (!article) {
        // Ancien slug d'un article publié : redirection permanente (liens et SEO conservés).
        const moved = await this.prisma.article.findFirst({
          where: { ...visibleWhere(), previousSlugs: { has: slug } },
          select: { slug: true },
        });
        if (moved) return { kind: 'redirect', slug: moved.slug } as const;
        throw notFound('Article introuvable.');
      }

      const related = await this.prisma.article.findMany({
        where: {
          ...visibleWhere(),
          id: { not: article.id },
          ...(article.categoryId ? { categoryId: article.categoryId } : {}),
        },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: CARD_SELECT,
      });
      const card = this.toCard(article);
      const canonicalUrl = this.site.url(`/conseils/${article.slug}`);
      const info = await this.site.get();
      const seo = {
        title: article.seoTitle ?? article.title,
        description: article.seoDescription ?? article.excerpt.slice(0, 160),
        canonicalUrl,
      };
      return {
        kind: 'article',
        article: {
          ...card,
          bodyHtml: article.bodyHtml,
          toc: article.toc as unknown as TocEntry[],
          updatedAt: article.updatedAt,
          seo,
          relatedCourseSlug: article.relatedCourseSlug,
          relatedArticles: related.map((row) => this.toCard(row)),
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.title,
            description: seo.description,
            ...(card.cover ? { image: [card.cover.url] } : {}),
            datePublished: card.publishedAt.toISOString(),
            dateModified: article.updatedAt.toISOString(),
            author: { '@type': 'Person', name: info.authorName },
            publisher: {
              '@type': 'Organization',
              name: info.name,
              ...(info.logoUrl ? { logo: { '@type': 'ImageObject', url: info.logoUrl } } : {}),
            },
            mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
            ...(card.category ? { articleSection: card.category.name } : {}),
          },
        },
      } as const;
    });
  }

  // ---------------------------------------------------------------------------
  // Administration
  // ---------------------------------------------------------------------------

  async listAdmin(
    query: AdminArticleQueryDto,
  ): Promise<{ items: AdminArticle[]; nextCursor: string | null }> {
    const limit = query.limit ?? 20;
    const now = new Date();
    const stateWhere: Prisma.ArticleWhereInput =
      query.state === 'draft'
        ? { status: 'draft' }
        : query.state === 'scheduled'
          ? { status: 'published', publishedAt: { gt: now } }
          : query.state === 'published'
            ? { status: 'published', publishedAt: { lte: now } }
            : {};
    const rows = await this.prisma.article.findMany({
      where: {
        deletedAt: null,
        ...stateWhere,
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: ADMIN_SELECT,
    });
    const items = rows.slice(0, limit).map((row) => this.toAdmin(row));
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
  }

  async getAdmin(id: string): Promise<AdminArticle> {
    return this.toAdmin(await this.findAdmin(id));
  }

  async create(dto: CreateArticleDto, actorId: string): Promise<AdminArticle> {
    await this.assertReferences(dto);
    const slug = dto.slug ?? (await this.uniqueSlug(slugify(dto.title, 160) || 'article'));
    await this.assertSlugAvailable(slug);
    const rendered = this.markdown.render(dto.bodyMarkdown);
    const article = await this.prisma.article.create({
      data: {
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        bodyMarkdown: dto.bodyMarkdown,
        bodyHtml: rendered.html,
        toc: rendered.toc as unknown as Prisma.InputJsonValue,
        readingMinutes: rendered.readingMinutes,
        categoryId: dto.categoryId ?? null,
        coverMediaId: dto.coverMediaId ?? null,
        coverAlt: dto.coverAlt ?? '',
        seoTitle: dto.seoTitle ?? null,
        seoDescription: dto.seoDescription ?? null,
        relatedCourseSlug: dto.relatedCourseSlug ?? null,
      },
      select: ADMIN_SELECT,
    });
    await this.log(AuditAction.ARTICLE_CREATED, actorId, article.id);
    return this.toAdmin(article);
  }

  async update(id: string, dto: UpdateArticleDto, actorId: string): Promise<AdminArticle> {
    const current = await this.findAdmin(id);
    await this.assertReferences(dto);

    let previousSlugs = current.previousSlugs;
    if (dto.slug && dto.slug !== current.slug) {
      await this.assertSlugAvailable(dto.slug, id);
      // Un article déjà publié garde son ancienne adresse (redirection permanente).
      const wasPublic = current.status === 'published' || current.publishedAt !== null;
      previousSlugs = [
        ...new Set([...current.previousSlugs, ...(wasPublic ? [current.slug] : [])]),
      ].filter((slug) => slug !== dto.slug);
    }
    const rendered = dto.bodyMarkdown !== undefined ? this.markdown.render(dto.bodyMarkdown) : null;

    const article = await this.prisma.article.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug, previousSlugs } : {}),
        ...(dto.excerpt !== undefined ? { excerpt: dto.excerpt } : {}),
        ...(rendered
          ? {
              bodyMarkdown: dto.bodyMarkdown,
              bodyHtml: rendered.html,
              toc: rendered.toc as unknown as Prisma.InputJsonValue,
              readingMinutes: rendered.readingMinutes,
            }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.coverMediaId !== undefined ? { coverMediaId: dto.coverMediaId } : {}),
        ...(dto.coverAlt !== undefined ? { coverAlt: dto.coverAlt } : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
        ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription } : {}),
        ...(dto.relatedCourseSlug !== undefined
          ? { relatedCourseSlug: dto.relatedCourseSlug }
          : {}),
      },
      select: ADMIN_SELECT,
    });
    await this.changed(current.slug, article.slug);
    await this.log(AuditAction.ARTICLE_UPDATED, actorId, id);
    return this.toAdmin(article);
  }

  async publish(id: string, publishAt: string | undefined, actorId: string): Promise<AdminArticle> {
    const current = await this.findAdmin(id);
    const date = publishAt ? new Date(publishAt) : new Date();
    const article = await this.prisma.article.update({
      where: { id },
      data: { status: 'published', publishedAt: date },
      select: ADMIN_SELECT,
    });
    await this.changed(current.slug);
    await this.log(AuditAction.ARTICLE_PUBLISHED, actorId, id, {
      scheduled: date > new Date(),
    });
    return this.toAdmin(article);
  }

  async unpublish(id: string, actorId: string): Promise<AdminArticle> {
    const current = await this.findAdmin(id);
    const article = await this.prisma.article.update({
      where: { id },
      data: { status: 'draft' },
      select: ADMIN_SELECT,
    });
    await this.changed(current.slug);
    await this.log(AuditAction.ARTICLE_UNPUBLISHED, actorId, id);
    return this.toAdmin(article);
  }

  /** Suppression logique : l'adresse et les anciens slugs sont libérés. */
  async remove(id: string, actorId: string): Promise<void> {
    const current = await this.findAdmin(id);
    await this.prisma.article.update({
      where: { id },
      data: { deletedAt: new Date(), slug: `supprime-${id}`, previousSlugs: [], status: 'draft' },
    });
    await this.changed(current.slug);
    await this.log(AuditAction.ARTICLE_DELETED, actorId, id);
  }

  // ---------------------------------------------------------------------------
  // Outils internes
  // ---------------------------------------------------------------------------

  private async findAdmin(id: string): Promise<AdminRecord & { publishedAt: Date | null }> {
    const article = await this.prisma.article.findFirst({
      where: { id, deletedAt: null },
      select: ADMIN_SELECT,
    });
    if (!article) throw notFound('Article introuvable.');
    return article;
  }

  private async assertReferences(dto: UpdateArticleDto): Promise<void> {
    if (dto.categoryId) {
      const category = await this.prisma.articleCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!category) throw fieldError('categoryId', 'catégorie introuvable');
    }
    if (dto.coverMediaId) {
      const media = await this.prisma.media.findFirst({
        where: { id: dto.coverMediaId, deletedAt: null, kind: 'image', status: 'ready' },
        select: { id: true },
      });
      if (!media) throw fieldError('coverMediaId', 'image introuvable ou pas encore prête');
    }
  }

  /** Un slug ne doit être ni l'adresse actuelle ni une ancienne adresse d'un autre article. */
  private async assertSlugAvailable(slug: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.article.findFirst({
      where: {
        OR: [{ slug }, { previousSlugs: { has: slug } }],
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (taken) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Cette adresse (slug) est déjà utilisée par un autre article.',
        [{ field: 'slug', messages: ['déjà utilisée'] }],
      );
    }
  }

  private async uniqueSlug(base: string): Promise<string> {
    for (let n = 1; n < 100; n += 1) {
      const candidate = n === 1 ? base : `${base.slice(0, 150)}-${n}`;
      const taken = await this.prisma.article.findFirst({
        where: { OR: [{ slug: candidate }, { previousSlugs: { has: candidate } }] },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw fieldError('slug', 'choisissez une adresse (slug) manuellement');
  }

  private async changed(...slugs: string[]): Promise<void> {
    await this.cache.changed([
      'articles',
      'article-categories',
      ...slugs.map((slug) => `article:${slug}` as const),
    ]);
  }

  private log(
    action: AuditAction,
    actorId: string,
    id: string,
    metadata?: Record<string, boolean>,
  ): Promise<void> {
    return this.audit.log({
      action,
      actorId,
      targetType: 'article',
      targetId: id,
      ...(metadata ? { metadata } : {}),
    });
  }

  private toCard(row: CardRecord): ArticleCardDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      readingMinutes: row.readingMinutes,
      publishedAt: row.publishedAt ?? new Date(0),
      cover: toPublicImage(row.coverMedia, row.coverAlt),
      category: row.category,
    };
  }

  private toAdmin(row: AdminRecord): AdminArticle {
    const { coverMedia, ...rest } = row;
    return { ...rest, state: articleState(row), cover: toPublicImage(coverMedia, row.coverAlt) };
  }
}
