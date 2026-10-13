import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentCacheService } from '../cache/content-cache.service';
import { notFound } from '../common/content.helpers';
import type { CategoryDto } from '../common/content-responses.dto';
import { slugify } from '../markdown/slug';
import type { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';

const SELECT = { id: true, slug: true, name: true, description: true, position: true } as const;

function slugTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const conflict = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.CONFLICT,
    'Cette adresse (slug) est déjà utilisée.',
    [{ field: 'slug', messages: ['déjà utilisée'] }],
  );

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
  ) {}

  /** Catégories ayant au moins un article publié, avec leur nombre d'articles. */
  listPublic(): Promise<CategoryDto[]> {
    return this.cache.getOrSet('article-categories', async () => {
      const now = new Date();
      const categories = await this.prisma.articleCategory.findMany({
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          ...SELECT,
          _count: {
            select: {
              articles: {
                where: { deletedAt: null, status: 'published', publishedAt: { lte: now } },
              },
            },
          },
        },
      });
      return categories
        .filter((category) => category._count.articles > 0)
        .map(({ _count, ...category }) => ({ ...category, articleCount: _count.articles }));
    });
  }

  listAdmin(): Promise<CategoryDto[]> {
    return this.prisma.articleCategory.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: SELECT,
    });
  }

  async create(dto: CreateCategoryDto, actorId: string): Promise<CategoryDto> {
    try {
      const category = await this.prisma.articleCategory.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? (slugify(dto.name) || 'categorie'),
          description: dto.description ?? null,
          position: dto.position ?? 0,
        },
        select: SELECT,
      });
      await this.changed(actorId, category.id);
      return category;
    } catch (error) {
      if (slugTaken(error)) throw conflict();
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string): Promise<CategoryDto> {
    try {
      const category = await this.prisma.articleCategory.update({
        where: { id },
        data: dto,
        select: SELECT,
      });
      await this.changed(actorId, id);
      return category;
    } catch (error) {
      if (slugTaken(error)) throw conflict();
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw notFound('Catégorie introuvable.');
      }
      throw error;
    }
  }

  /** Les articles de la catégorie restent publiés, sans catégorie. */
  async remove(id: string, actorId: string): Promise<void> {
    const deleted = await this.prisma.articleCategory.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound('Catégorie introuvable.');
    await this.changed(actorId, id);
  }

  private async changed(actorId: string, id: string): Promise<void> {
    await this.cache.changed(['article-categories', 'articles']);
    await this.audit.log({
      action: AuditAction.CATEGORY_CHANGED,
      actorId,
      targetType: 'article_category',
      targetId: id,
    });
  }
}
