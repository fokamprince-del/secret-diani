import { Module } from '@nestjs/common';
import { AdminArticlesController, ArticlesController } from './articles/articles.controller';
import { ArticlesService } from './articles/articles.service';
import {
  AdminCategoriesController,
  CategoriesController,
} from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { SiteInfoService } from './common/site-info.service';
import { AdminFaqController, FaqController } from './faq/faq.controller';
import { FaqService } from './faq/faq.service';
import { MarkdownService } from './markdown/markdown.service';
import { AdminPagesController, PagesController } from './pages/pages.controller';
import { PagesService } from './pages/pages.service';
import { AdminReviewsController, ReviewsController } from './reviews/reviews.controller';
import { ReviewsService } from './reviews/reviews.service';
import { ApiRobotsController, SeoController } from './seo/seo.controller';
import { SeoService } from './seo/seo.service';

/** Contenus éditoriaux : articles, catégories, pages, FAQ, avis, SEO (public + administration). */
@Module({
  controllers: [
    ArticlesController,
    AdminArticlesController,
    CategoriesController,
    AdminCategoriesController,
    PagesController,
    AdminPagesController,
    FaqController,
    AdminFaqController,
    ReviewsController,
    AdminReviewsController,
    SeoController,
    ApiRobotsController,
  ],
  providers: [
    MarkdownService,
    SiteInfoService,
    ArticlesService,
    CategoriesService,
    PagesService,
    FaqService,
    ReviewsService,
    SeoService,
  ],
  exports: [MarkdownService, SiteInfoService],
})
export class ContentModule {}
