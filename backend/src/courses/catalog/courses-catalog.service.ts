import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { toDecimalString } from '../../common/utils/money';
import { ContentCacheService } from '../../content/cache/content-cache.service';
import { notFound } from '../../content/common/content.helpers';
import { SiteInfoService } from '../../content/common/site-info.service';
import { PUBLIC_IMAGE_SELECT, toPublicImage } from '../../media/media.types';
import { PrismaService } from '../../prisma/prisma.service';
import type { CourseCardDto, CourseDetailDto, PackDto } from '../dto/courses.dto';

export const PUBLISHED_COURSE = {
  status: 'published',
  deletedAt: null,
  pack: { visible: true },
} satisfies Prisma.CourseWhereInput;

const featuresSchema = z.array(z.string());

export function packFeatures(value: Prisma.JsonValue): string[] {
  const parsed = featuresSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  featured: true,
  coverAlt: true,
  coverMedia: { select: PUBLIC_IMAGE_SELECT },
  pack: { select: { slug: true, name: true, rank: true, priceCents: true } },
  lessons: { where: { published: true }, select: { videoDurationSeconds: true } },
} satisfies Prisma.CourseSelect;

type CardRow = Prisma.CourseGetPayload<{ select: typeof CARD_SELECT }>;

function toCard(row: CardRow): CourseCardDto {
  const seconds = row.lessons.reduce((sum, lesson) => sum + (lesson.videoDurationSeconds ?? 0), 0);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    featured: row.featured,
    cover: toPublicImage(row.coverMedia, row.coverAlt),
    pack: row.pack,
    lessonCount: row.lessons.length,
    durationMinutes: Math.round(seconds / 60),
  };
}

/**
 * Catalogue public des formations : packs (avec les formations qu'ils ouvrent, packs inférieurs
 * compris), formations phares, programme d'une formation. Aucun contenu de leçon payante.
 * Mis en cache, invalidé à chaque modification (étiquette « courses »).
 */
@Injectable()
export class CoursesCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
    private readonly site: SiteInfoService,
  ) {}

  packs(): Promise<PackDto[]> {
    return this.cache.getOrSet('courses:packs', async () => {
      const [packs, courses] = await Promise.all([
        this.prisma.coursePack.findMany({
          where: { visible: true },
          orderBy: { rank: 'asc' },
          select: {
            id: true,
            slug: true,
            name: true,
            summary: true,
            priceCents: true,
            rank: true,
            features: true,
            callsIncluded: true,
          },
        }),
        this.prisma.course.findMany({
          where: PUBLISHED_COURSE,
          orderBy: { position: 'asc' },
          select: { slug: true, title: true, pack: { select: { rank: true } } },
        }),
      ]);
      return packs.map((pack) => ({
        ...pack,
        features: packFeatures(pack.features),
        courses: courses
          .filter((course) => course.pack.rank <= pack.rank)
          .map(({ slug, title }) => ({ slug, title })),
      }));
    });
  }

  list(): Promise<CourseCardDto[]> {
    return this.cache.getOrSet('courses:list', async () => {
      const rows = await this.prisma.course.findMany({
        where: PUBLISHED_COURSE,
        orderBy: [{ featured: 'desc' }, { position: 'asc' }],
        take: 200,
        select: CARD_SELECT,
      });
      return rows.map(toCard);
    });
  }

  detail(slug: string): Promise<CourseDetailDto> {
    return this.cache.getOrSet(`courses:detail:${slug}`, async () => {
      const [row, info] = await Promise.all([
        this.prisma.course.findFirst({
          where: { ...PUBLISHED_COURSE, slug },
          select: {
            ...CARD_SELECT,
            descriptionHtml: true,
            seoTitle: true,
            seoDescription: true,
            modules: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                lessons: {
                  where: { published: true },
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    slug: true,
                    title: true,
                    videoDurationSeconds: true,
                    freePreview: true,
                    quiz: { select: { id: true } },
                  },
                },
              },
            },
          },
        }),
        this.site.get(),
      ]);
      if (!row) throw notFound('Formation introuvable.');
      const card = toCard(row);
      const canonicalUrl = this.site.url(`/formations/${row.slug}`);
      return {
        ...card,
        descriptionHtml: row.descriptionHtml,
        modules: row.modules.map((module) => ({
          id: module.id,
          title: module.title,
          lessons: module.lessons.map((lesson) => ({
            id: lesson.id,
            slug: lesson.slug,
            title: lesson.title,
            durationSeconds: lesson.videoDurationSeconds,
            freePreview: lesson.freePreview,
            hasQuiz: lesson.quiz !== null,
          })),
        })),
        seo: {
          title: row.seoTitle ?? `${row.title} · Formation`,
          description: row.seoDescription ?? row.summary.slice(0, 160),
          canonicalUrl,
        },
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: row.title,
          description: row.summary,
          url: canonicalUrl,
          inLanguage: 'fr',
          provider: { '@type': 'Organization', name: info.name, url: info.url },
          ...(card.cover ? { image: card.cover.url } : {}),
          offers: {
            '@type': 'Offer',
            category: 'Paid',
            price: toDecimalString(row.pack.priceCents),
            priceCurrency: 'EUR',
          },
          hasCourseInstance: {
            '@type': 'CourseInstance',
            courseMode: 'online',
            courseWorkload: `PT${Math.max(card.durationMinutes, 1)}M`,
          },
        },
      };
    });
  }
}
