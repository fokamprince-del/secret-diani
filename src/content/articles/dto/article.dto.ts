import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CursorQueryDto } from '../../../common/pagination/cursor';
import { Trim } from '../../../common/utils/transforms';
import { SLUG_PATTERN } from '../../markdown/slug';

const SLUG_MESSAGE = {
  message: 'fr: uniquement des minuscules, chiffres et tirets (ex. creme-au-beurre)',
};

export class CreateArticleDto {
  @ApiProperty({ example: 'Réussir sa crème au beurre', maxLength: 200 })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description: 'Généré depuis le titre si absent',
    example: 'reussir-sa-creme-au-beurre',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(160)
  @Matches(SLUG_PATTERN, SLUG_MESSAGE)
  slug?: string;

  @ApiProperty({ maxLength: 500, description: 'Résumé affiché dans les listes' })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  excerpt!: string;

  @ApiProperty({ description: 'Contenu en Markdown (le HTML brut est ignoré)', maxLength: 60000 })
  @IsString()
  @MinLength(1)
  @MaxLength(60_000)
  bodyMarkdown!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Image de couverture (média prêt)' })
  @IsOptional()
  @IsUUID()
  coverMediaId?: string | null;

  @ApiPropertyOptional({ maxLength: 300, description: 'Texte alternatif de la couverture' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  coverAlt?: string;

  @ApiPropertyOptional({ maxLength: 70, nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Formation mise en avant en fin d’article' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(SLUG_PATTERN, SLUG_MESSAGE)
  relatedCourseSlug?: string | null;
}

export class UpdateArticleDto extends PartialType(CreateArticleDto) {}

export class PublishArticleDto {
  @ApiPropertyOptional({
    description: 'Date de publication (ISO 8601). Future = article programmé. Défaut : maintenant.',
    example: '2026-11-01T08:00:00+01:00',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  publishAt?: string;
}

export class AdminArticleQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'scheduled', 'published'] })
  @IsOptional()
  @IsIn(['draft', 'scheduled', 'published'])
  state?: 'draft' | 'scheduled' | 'published';

  @ApiPropertyOptional({ description: 'Recherche dans le titre', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class PublicArticleQueryDto {
  @ApiPropertyOptional({ description: 'Slug de catégorie' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_PATTERN, SLUG_MESSAGE)
  category?: string;

  @ApiPropertyOptional({ description: 'Identifiant du dernier article de la page précédente' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminArticleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: [String], description: 'Anciennes adresses redirigées' })
  previousSlugs!: string[];

  @ApiProperty()
  title!: string;

  @ApiProperty()
  excerpt!: string;

  @ApiProperty()
  bodyMarkdown!: string;

  @ApiProperty({ enum: ['draft', 'published'] })
  status!: string;

  @ApiProperty({ enum: ['draft', 'scheduled', 'published'], description: 'État calculé' })
  state!: string;

  @ApiProperty({ nullable: true, type: Date })
  publishedAt!: Date | null;

  @ApiProperty()
  readingMinutes!: number;

  @ApiProperty({ nullable: true, type: String })
  categoryId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  coverMediaId!: string | null;

  @ApiProperty()
  coverAlt!: string;

  @ApiProperty({ nullable: true, type: String })
  seoTitle!: string | null;

  @ApiProperty({ nullable: true, type: String })
  seoDescription!: string | null;

  @ApiProperty({ nullable: true, type: String })
  relatedCourseSlug!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class AdminArticleListDto {
  @ApiProperty({ type: [AdminArticleDto] })
  items!: AdminArticleDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
}
