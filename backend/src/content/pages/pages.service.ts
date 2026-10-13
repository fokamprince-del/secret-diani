import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentCacheService } from '../cache/content-cache.service';
import { notFound } from '../common/content.helpers';
import type { PageDto, PageLinkDto } from '../common/content-responses.dto';
import { SiteInfoService } from '../common/site-info.service';
import { MarkdownService, type TocEntry } from '../markdown/markdown.service';
import type { UpsertPageDto } from './pages.dto';

const ADMIN_SELECT = {
  id: true,
  slug: true,
  title: true,
  bodyMarkdown: true,
  published: true,
  seoTitle: true,
  seoDescription: true,
  updatedAt: true,
} satisfies Prisma.StaticPageSelect;

export type AdminPage = Prisma.StaticPageGetPayload<{ select: typeof ADMIN_SELECT }>;

/** Pages statiques (À propos, mentions légales, CGV, confidentialité…), modifiables sans développeur. */
@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markdown: MarkdownService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
    private readonly site: SiteInfoService,
  ) {}

  listPublic(): Promise<PageLinkDto[]> {
    return this.cache.getOrSet('pages', () =>
      this.prisma.staticPage.findMany({
        where: { published: true },
        orderBy: { title: 'asc' },
        select: { slug: true, title: true },
      }),
    );
  }

  getPublic(slug: string): Promise<PageDto> {
    return this.cache.getOrSet(`page:${slug}`, async () => {
      const page = await this.prisma.staticPage.findFirst({
        where: { slug, published: true },
        select: {
          slug: true,
          title: true,
          bodyHtml: true,
          toc: true,
          updatedAt: true,
          seoTitle: true,
          seoDescription: true,
        },
      });
      if (!page) throw notFound('Page introuvable.');
      return {
        slug: page.slug,
        title: page.title,
        bodyHtml: page.bodyHtml,
        toc: page.toc as unknown as TocEntry[],
        updatedAt: page.updatedAt,
        seo: {
          title: page.seoTitle ?? page.title,
          description: page.seoDescription ?? this.markdown.toText(page.bodyHtml).slice(0, 160),
          canonicalUrl: this.site.url(`/${page.slug}`),
        },
      };
    });
  }

  listAdmin(): Promise<AdminPage[]> {
    return this.prisma.staticPage.findMany({ orderBy: { slug: 'asc' }, select: ADMIN_SELECT });
  }

  async getAdmin(slug: string): Promise<AdminPage> {
    const page = await this.prisma.staticPage.findUnique({ where: { slug }, select: ADMIN_SELECT });
    if (!page) throw notFound('Page introuvable.');
    return page;
  }

  /** Crée ou remplace une page (le slug est l'adresse : /a-propos, /cgv…). */
  async upsert(slug: string, dto: UpsertPageDto, actorId: string): Promise<AdminPage> {
    const rendered = this.markdown.render(dto.bodyMarkdown);
    const data = {
      title: dto.title,
      bodyMarkdown: dto.bodyMarkdown,
      bodyHtml: rendered.html,
      toc: rendered.toc as unknown as Prisma.InputJsonValue,
      published: dto.published,
      seoTitle: dto.seoTitle ?? null,
      seoDescription: dto.seoDescription ?? null,
    };
    const page = await this.prisma.staticPage.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data,
      select: ADMIN_SELECT,
    });
    await this.cache.changed(['pages', `page:${slug}`]);
    await this.audit.log({
      action: AuditAction.PAGE_UPDATED,
      actorId,
      targetType: 'static_page',
      targetId: page.id,
    });
    return page;
  }
}
