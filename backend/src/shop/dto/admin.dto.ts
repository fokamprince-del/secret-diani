import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ShippingMethod, ShopProductKind, StockMovementReason } from '@prisma/client';
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
  NotEquals,
  ValidateNested,
} from 'class-validator';
import { EmptyToNull, Trim } from '../../common/utils/transforms';
import { SLUG_PATTERN } from '../../content/markdown/slug';
import { KitItemDto } from './catalog.dto';

const SLUG_MESSAGE = 'fr: minuscules, chiffres et tirets uniquement (ex. kit-debutant)';
const MAX_PRICE_CENTS = 1_000_000;

// --- Produits --------------------------------------------------------------------------------

export class ShopVariantInputDto {
  @ApiPropertyOptional({ description: 'Variante existante à modifier ; absente = nouvelle' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({
    example: 'KIT-DEBUTANT',
    description: 'Référence unique (majuscules, chiffres, tirets)',
  })
  @Trim()
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,63}$/, {
    message: 'fr: majuscules, chiffres et tirets uniquement (ex. KIT-DEBUTANT)',
  })
  sku!: string;

  @ApiProperty({ example: 'Standard' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @ApiProperty({ example: 3799, description: 'Prix TTC en centimes' })
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents!: number;

  @ApiProperty({ example: 650, description: 'Poids d’expédition en grammes' })
  @IsInt()
  @Min(0)
  @Max(100_000)
  weightGrams!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class KitItemInputDto {
  @ApiProperty({ example: 'Poche à douille' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(300)
  details?: string | null;
}

export class ShopImageInputDto {
  @ApiProperty()
  @IsUUID()
  mediaId!: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  alt?: string;
}

export class CreateShopProductDto {
  @ApiProperty({ example: 'Kit Débutant' })
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

  @ApiProperty({ enum: ShopProductKind })
  @IsEnum(ShopProductKind)
  kind!: ShopProductKind;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(300)
  shortDescription?: string | null;

  @ApiPropertyOptional({ description: 'Markdown (HTML brut désactivé)', maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  descriptionMarkdown?: string;

  @ApiProperty({
    type: [ShopVariantInputDto],
    description: 'Au moins une variante ; ordre = affichage',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ShopVariantInputDto)
  variants!: ShopVariantInputDto[];

  @ApiPropertyOptional({ type: [KitItemInputDto], description: 'Composition (kits)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => KitItemInputDto)
  composition?: KitItemInputDto[];

  @ApiPropertyOptional({ type: [ShopImageInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ShopImageInputDto)
  images?: ShopImageInputDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ maxLength: 70 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null;
}

export class UpdateShopProductDto extends PartialType(CreateShopProductDto) {}

export class AdminShopVariantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  priceCents!: number;

  @ApiProperty()
  weightGrams!: number;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ description: 'En stock' })
  onHand!: number;

  @ApiProperty({ description: 'Réservé (paiements en cours)' })
  reserved!: number;
}

export class AdminShopImageDto {
  @ApiProperty()
  mediaId!: string;

  @ApiProperty()
  alt!: string;

  @ApiProperty({ nullable: true, type: String })
  previewUrl!: string | null;
}

export class AdminShopProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ShopProductKind })
  kind!: ShopProductKind;

  @ApiProperty({ nullable: true, type: String })
  shortDescription!: string | null;

  @ApiProperty()
  descriptionMarkdown!: string;

  @ApiProperty({ type: [AdminShopVariantDto] })
  variants!: AdminShopVariantDto[];

  @ApiProperty({ type: [KitItemDto] })
  composition!: KitItemDto[];

  @ApiProperty({ type: [AdminShopImageDto] })
  images!: AdminShopImageDto[];

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

export class AdminShopProductQueryDto {
  @ApiPropertyOptional({ enum: ShopProductKind })
  @IsOptional()
  @IsEnum(ShopProductKind)
  kind?: ShopProductKind;
}

// --- Stock -----------------------------------------------------------------------------------

export class AdjustStockDto {
  @ApiProperty({ example: 10, description: 'Variation (+ réassort, − casse ou inventaire)' })
  @IsInt()
  @NotEquals(0)
  @Min(-10_000)
  @Max(10_000)
  delta!: number;

  @ApiProperty({ example: 'Réassort fournisseur' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  note!: string;
}

export class StockThresholdDto {
  @ApiProperty({ example: 3, description: 'Alerte « stock bas » à partir de ce disponible' })
  @IsInt()
  @Min(0)
  @Max(10_000)
  lowStockThreshold!: number;
}

export class AdminStockDto {
  @ApiProperty()
  variantId!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  variantLabel!: string;

  @ApiProperty()
  onHand!: number;

  @ApiProperty()
  reserved!: number;

  @ApiProperty()
  available!: number;

  @ApiProperty()
  lowStockThreshold!: number;

  @ApiProperty()
  low!: boolean;
}

export class StockMovementDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  delta!: number;

  @ApiProperty({ enum: StockMovementReason })
  reason!: StockMovementReason;

  @ApiProperty({ nullable: true, type: String })
  orderId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  actorId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

// --- Livraison -------------------------------------------------------------------------------

export class CreateShippingRateDto {
  @ApiProperty({ example: 'Colissimo' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ShippingMethod })
  @IsEnum(ShippingMethod)
  method!: ShippingMethod;

  @ApiPropertyOptional({
    type: [String],
    example: ['FR'],
    description: 'Pays desservis (livraison)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ArrayUnique()
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'fr: codes pays à deux lettres (FR, BE…)' })
  countries?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  minWeightGrams?: number;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Inclus ; vide = sans limite' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  maxWeightGrams?: number | null;

  @ApiProperty({ example: 790 })
  @IsInt()
  @Min(0)
  @Max(100_000)
  priceCents!: number;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Offerte à partir de ce sous-total',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  freeFromCents?: number | null;

  @ApiPropertyOptional({ example: '2 à 4 jours ouvrés' })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(80)
  delay?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateShippingRateDto extends PartialType(CreateShippingRateDto) {}

export class ShippingRateDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ShippingMethod })
  method!: ShippingMethod;

  @ApiProperty({ type: [String] })
  countries!: string[];

  @ApiProperty()
  minWeightGrams!: number;

  @ApiProperty({ nullable: true, type: Number })
  maxWeightGrams!: number | null;

  @ApiProperty()
  priceCents!: number;

  @ApiProperty({ nullable: true, type: Number })
  freeFromCents!: number | null;

  @ApiProperty({ nullable: true, type: String })
  delay!: string | null;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  active!: boolean;
}
