import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CateringKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EmptyToNull, Trim } from '../../common/utils/transforms';
import { SLUG_PATTERN } from '../../content/markdown/slug';
import { CompositionItemDto, CateringVariantDto, FlavourDto } from './catalog.dto';

const SLUG_MESSAGE = 'fr: minuscules, chiffres et tirets uniquement (ex. plateau-decouverte)';
const MAX_PRICE_CENTS = 1_000_000;

// --- Catégories ------------------------------------------------------------------------------

export class CreateCateringCategoryDto {
  @ApiProperty({ example: 'Plateaux' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Généré depuis le nom si absent' })
  @IsOptional()
  @Trim()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ enum: CateringKind, description: 'Affichage : plateaux, à la carte, layer cakes' })
  @IsEnum(CateringKind)
  kind!: CateringKind;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateCateringCategoryDto extends PartialType(CreateCateringCategoryDto) {}

export class AdminCateringCategoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: CateringKind })
  kind!: CateringKind;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  visible!: boolean;

  @ApiProperty({ description: 'Nombre de produits (non supprimés)' })
  productCount!: number;
}

// --- Parfums ---------------------------------------------------------------------------------

export class CreateFlavourDto {
  @ApiProperty({ example: 'Mangue-passion' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Généré depuis le nom si absent' })
  @IsOptional()
  @Trim()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateFlavourDto extends PartialType(CreateFlavourDto) {}

export class AdminFlavourDto extends FlavourDto {
  @ApiProperty()
  position!: number;

  @ApiProperty()
  visible!: boolean;
}

// --- Produits --------------------------------------------------------------------------------

export class CompositionItemInputDto {
  @ApiProperty({ example: 'mini burgers' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiPropertyOptional({ nullable: true, type: Number, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity?: number | null;
}

export class VariantInputDto {
  @ApiPropertyOptional({
    description: 'Variante existante à modifier ; absente = nouvelle variante',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: '6–8 parts' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @ApiProperty({ example: 5000, description: 'Prix en centimes' })
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents!: number;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  servingsMin?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  servingsMax?: number | null;
}

export class ProductImageInputDto {
  @ApiProperty()
  @IsUUID()
  mediaId!: string;

  @ApiPropertyOptional({
    description: 'Texte alternatif (vide = image décorative)',
    maxLength: 300,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  alt?: string;
}

export class CreateCateringProductDto {
  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'Plateau découverte' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ description: 'Généré depuis le nom si absent' })
  @IsOptional()
  @Trim()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(160)
  slug?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ type: [CompositionItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CompositionItemInputDto)
  composition?: CompositionItemInputDto[];

  @ApiProperty({
    type: [VariantInputDto],
    description: 'Au moins une variante (prix) ; l’ordre du tableau est l’ordre d’affichage',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];

  @ApiPropertyOptional({ default: 0, description: 'Nombre maximal de parfums au choix' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxFlavours?: number;

  @ApiPropertyOptional({ type: [String], description: 'Parfums proposés' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  flavourIds?: string[];

  @ApiPropertyOptional({
    type: [ProductImageInputDto],
    description: 'Galerie ; la première image sert de vignette',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images?: ProductImageInputDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 70 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null;
}

export class UpdateCateringProductDto extends PartialType(CreateCateringProductDto) {}

export class AdminCateringProductQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class AdminProductImageDto {
  @ApiProperty()
  mediaId!: string;

  @ApiProperty()
  alt!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Aperçu (plus petite variante WebP)' })
  previewUrl!: string | null;
}

export class AdminCateringProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ type: [CompositionItemDto] })
  composition!: CompositionItemDto[];

  @ApiProperty({ type: [CateringVariantDto] })
  variants!: CateringVariantDto[];

  @ApiProperty()
  maxFlavours!: number;

  @ApiProperty({ type: [FlavourDto] })
  flavours!: FlavourDto[];

  @ApiProperty({ type: [AdminProductImageDto] })
  images!: AdminProductImageDto[];

  @ApiProperty()
  position!: number;

  @ApiProperty()
  visible!: boolean;

  @ApiProperty({ nullable: true, type: String })
  seoTitle!: string | null;

  @ApiProperty({ nullable: true, type: String })
  seoDescription!: string | null;

  @ApiProperty()
  updatedAt!: Date;
}
