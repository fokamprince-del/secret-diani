import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ImageSourceDto {
  @ApiProperty()
  url!: string;

  @ApiProperty({ description: 'Largeur en pixels (descripteur srcset « w »)' })
  width!: number;
}

class ImageSourcesDto {
  @ApiProperty({ type: [ImageSourceDto] })
  avif!: ImageSourceDto[];

  @ApiProperty({ type: [ImageSourceDto] })
  webp!: ImageSourceDto[];
}

/** Image prête à afficher : <picture> AVIF/WebP, ratio réservé, aperçu flou. */
export class PublicImageDto {
  @ApiProperty({ description: 'Texte alternatif (vide = image décorative)' })
  alt!: string;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  height!: number;

  @ApiProperty({ nullable: true, type: String, description: 'Data URI WebP de quelques octets' })
  blurDataUrl!: string | null;

  @ApiProperty({ type: ImageSourcesDto })
  sources!: ImageSourcesDto;

  @ApiProperty({ description: 'Plus grande variante WebP (repli, Open Graph)' })
  url!: string;
}

export class TocEntryDto {
  @ApiProperty({ description: 'Ancre du titre dans le HTML' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: [2, 3] })
  level!: 2 | 3;
}

export class SeoDto {
  @ApiProperty({ description: 'Balise <title> (≤ 70 caractères conseillés)' })
  title!: string;

  @ApiProperty({ description: 'Meta description (≤ 160 caractères)' })
  description!: string;

  @ApiProperty({ description: 'URL canonique sur le site' })
  canonicalUrl!: string;
}

export class CategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  position!: number;

  @ApiPropertyOptional({ description: 'Nombre d’articles publiés (liste publique)' })
  articleCount?: number;
}

export class CategoryRefDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;
}

export class ArticleCardDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  excerpt!: string;

  @ApiProperty()
  readingMinutes!: number;

  @ApiProperty()
  publishedAt!: Date;

  @ApiProperty({ type: PublicImageDto, nullable: true })
  cover!: PublicImageDto | null;

  @ApiProperty({ type: CategoryRefDto, nullable: true })
  category!: CategoryRefDto | null;
}

export class ArticleListDto {
  @ApiProperty({ type: [ArticleCardDto] })
  items!: ArticleCardDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
}

export class ArticleDetailDto extends ArticleCardDto {
  @ApiProperty({ description: 'HTML assaini (liste blanche de balises)' })
  bodyHtml!: string;

  @ApiProperty({ type: [TocEntryDto] })
  toc!: TocEntryDto[];

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: SeoDto })
  seo!: SeoDto;

  @ApiProperty({ nullable: true, type: String })
  relatedCourseSlug!: string | null;

  @ApiProperty({ type: [ArticleCardDto] })
  relatedArticles!: ArticleCardDto[];

  @ApiProperty({
    description: 'Données structurées schema.org (Article), à insérer telles quelles',
  })
  jsonLd!: Record<string, unknown>;
}

export class PageDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  bodyHtml!: string;

  @ApiProperty({ type: [TocEntryDto] })
  toc!: TocEntryDto[];

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: SeoDto })
  seo!: SeoDto;
}

export class PageLinkDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;
}

export class FaqItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    enum: ['general', 'traiteur', 'formations', 'boutique', 'livraison', 'paiement', 'retours'],
  })
  category!: string;

  @ApiProperty()
  question!: string;

  @ApiProperty({ description: 'Réponse en HTML assaini' })
  answerHtml!: string;
}

export class FaqListDto {
  @ApiProperty({ type: [FaqItemDto] })
  items!: FaqItemDto[];

  @ApiProperty({ description: 'Données structurées schema.org (FAQPage)' })
  jsonLd!: Record<string, unknown>;
}

export class ReviewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Awa D.' })
  authorName!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty()
  content!: string;

  @ApiProperty({ nullable: true, type: String, example: 'Anniversaire, 40 personnes' })
  occasion!: string | null;

  @ApiProperty({ example: '2026-09-12' })
  receivedOn!: string;
}

export class ReviewListDto {
  @ApiProperty({ type: [ReviewDto] })
  items!: ReviewDto[];

  @ApiProperty({ description: 'Nombre total d’avis publiés' })
  count!: number;

  @ApiProperty({ nullable: true, type: Number, description: 'Note moyenne (1 décimale)' })
  average!: number | null;
}
