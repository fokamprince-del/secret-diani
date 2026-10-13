import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShopProductKind } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PublicImageDto, SeoDto } from '../../content/common/content-responses.dto';

export class AvailabilityDto {
  @ApiProperty({ enum: ['in_stock', 'low_stock', 'out_of_stock'] })
  status!: 'in_stock' | 'low_stock' | 'out_of_stock';

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Quantité à afficher (« plus que 2 ») sous le seuil ; null sinon',
  })
  remaining!: number | null;
}

export class ShopVariantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'KIT-DEBUTANT' })
  sku!: string;

  @ApiProperty({ example: 'Standard' })
  label!: string;

  @ApiProperty({ example: 3799, description: 'Prix TTC en centimes' })
  priceCents!: number;

  @ApiProperty({ type: AvailabilityDto })
  availability!: AvailabilityDto;
}

export class KitItemDto {
  @ApiProperty({ example: 'Poche à douille' })
  label!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ nullable: true, type: String })
  details!: string | null;
}

export class ShopProductCardDto {
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

  @ApiProperty({ description: 'Prix le plus bas (« à partir de »), en centimes' })
  fromPriceCents!: number;

  @ApiProperty({ type: PublicImageDto, nullable: true })
  image!: PublicImageDto | null;

  @ApiProperty({ type: AvailabilityDto, description: 'Meilleure disponibilité des variantes' })
  availability!: AvailabilityDto;
}

export class ShopProductDetailDto extends ShopProductCardDto {
  @ApiProperty({ description: 'Description en HTML assaini' })
  descriptionHtml!: string;

  @ApiProperty({ type: [ShopVariantDto] })
  variants!: ShopVariantDto[];

  @ApiProperty({ type: [KitItemDto], description: 'Composition (kits)' })
  composition!: KitItemDto[];

  @ApiProperty({ type: [PublicImageDto] })
  gallery!: PublicImageDto[];

  @ApiProperty({ type: SeoDto })
  seo!: SeoDto;

  @ApiProperty({ description: 'Données structurées schema.org (Product + Offer)' })
  jsonLd!: Record<string, unknown>;
}

export class ShopProductQueryDto {
  @ApiPropertyOptional({ enum: ShopProductKind })
  @IsOptional()
  @IsEnum(ShopProductKind)
  kind?: ShopProductKind;
}

export class ComparisonKitDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  fromPriceCents!: number;
}

export class ComparisonRowDto {
  @ApiProperty({ example: 'Poche à douille' })
  label!: string;

  @ApiProperty({
    type: [Number],
    nullable: true,
    description: 'Quantité par kit, dans l’ordre des colonnes (null = absent)',
  })
  values!: (number | null)[];
}

export class KitComparisonDto {
  @ApiProperty({ type: [ComparisonKitDto], description: 'Colonnes, du moins cher au plus cher' })
  kits!: ComparisonKitDto[];

  @ApiProperty({ type: [ComparisonRowDto] })
  rows!: ComparisonRowDto[];
}
