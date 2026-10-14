import { ApiProperty } from '@nestjs/swagger';
import { CateringKind } from '@prisma/client';
import { PublicImageDto, SeoDto } from '../../content/common/content-responses.dto';

export class CompositionItemDto {
  @ApiProperty({ example: 'mini burgers' })
  label!: string;

  @ApiProperty({ nullable: true, type: Number, example: 5 })
  quantity!: number | null;
}

export class CateringVariantDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '6–8 parts' })
  label!: string;

  @ApiProperty({ example: 5000, description: 'Prix en centimes (EUR)' })
  priceCents!: number;

  @ApiProperty({ nullable: true, type: Number })
  servingsMin!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  servingsMax!: number | null;
}

export class FlavourDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'mangue-passion' })
  slug!: string;

  @ApiProperty({ example: 'Mangue-passion' })
  name!: string;
}

export class CateringProductCardDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ type: [CompositionItemDto] })
  composition!: CompositionItemDto[];

  @ApiProperty({
    type: [CateringVariantDto],
    description: 'Tailles ou conditionnements, dans l’ordre',
  })
  variants!: CateringVariantDto[];

  @ApiProperty({ description: 'Prix le plus bas (« à partir de »), en centimes' })
  fromPriceCents!: number;

  @ApiProperty({ description: 'Nombre maximal de parfums au choix (0 = sans parfum)' })
  maxFlavours!: number;

  @ApiProperty({ type: [FlavourDto], description: 'Parfums proposés pour ce produit' })
  flavours!: FlavourDto[];

  @ApiProperty({ type: PublicImageDto, nullable: true, description: 'Vignette (1re image)' })
  image!: PublicImageDto | null;

  @ApiProperty({ type: [PublicImageDto], description: 'Galerie complète' })
  gallery!: PublicImageDto[];

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Bouton « Contacter » : WhatsApp avec message pré-rempli (null sans numéro)',
  })
  whatsappUrl!: string | null;
}

export class CateringCategoryDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: CateringKind })
  kind!: CateringKind;

  @ApiProperty({ type: [CateringProductCardDto] })
  products!: CateringProductCardDto[];
}

export class DepositRuleDto {
  @ApiProperty({ example: 5000, description: 'Seuil en centimes' })
  thresholdCents!: number;

  @ApiProperty({ example: 1000, description: 'Acompte sous le seuil, en centimes' })
  belowCents!: number;

  @ApiProperty({ example: 2000, description: 'Acompte à partir du seuil, en centimes' })
  fromCents!: number;
}

export class CateringConditionsDto {
  @ApiProperty({ type: [String], description: 'Conditions de commande, à afficher telles quelles' })
  items!: string[];

  @ApiProperty({ type: DepositRuleDto })
  deposit!: DepositRuleDto;

  @ApiProperty({ description: 'Délai minimal entre la demande et l’événement (jours)' })
  minNoticeDays!: number;

  @ApiProperty({
    description: 'Commande en ligne ouverte (panier, créneau, acompte en ligne) ; sinon contact',
  })
  onlineOrdering!: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Lien WhatsApp général (null sans numéro configuré)',
  })
  whatsappUrl!: string | null;
}

export class CateringCatalogDto {
  @ApiProperty({ type: [CateringCategoryDto] })
  categories!: CateringCategoryDto[];

  @ApiProperty({ type: [FlavourDto], description: 'Tous les parfums disponibles' })
  flavours!: FlavourDto[];

  @ApiProperty({ type: CateringConditionsDto })
  conditions!: CateringConditionsDto;
}

export class CategoryRefDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: CateringKind })
  kind!: CateringKind;
}

export class CateringProductDetailDto extends CateringProductCardDto {
  @ApiProperty({ type: CategoryRefDto })
  category!: CategoryRefDto;

  @ApiProperty({ type: SeoDto })
  seo!: SeoDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Données structurées schema.org (Product + offres)',
  })
  jsonLd!: Record<string, unknown>;
}
