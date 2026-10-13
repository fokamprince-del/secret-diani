import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShippingMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EmptyToNull, NormalizeEmail, Trim } from '../../common/utils/transforms';
import { PublicImageDto } from '../../content/common/content-responses.dto';
import { PHONE_PATTERN } from '../../users/dto/profile.dto';
import { AvailabilityDto } from './catalog.dto';

const PHONE_MESSAGE = { message: 'fr: doit être un numéro de téléphone valide' };

export class AddCartItemDto {
  @ApiProperty()
  @IsUUID()
  variantId!: string;

  @ApiProperty({ minimum: 1, maximum: 99, default: 1 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class SetCartItemDto {
  @ApiProperty({ minimum: 0, maximum: 99, description: '0 retire l’article' })
  @IsInt()
  @Min(0)
  @Max(99)
  quantity!: number;
}

export class CartQueryDto {
  @ApiPropertyOptional({
    example: 'FR',
    description: 'Pays de livraison (ISO 3166-1 alpha-2) pour calculer les options de livraison',
  })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'fr: code pays à deux lettres (FR, BE…)' })
  country?: string;
}

export class CartLineDto {
  @ApiProperty()
  variantId!: string;

  @ApiProperty()
  productSlug!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  variantLabel!: string;

  @ApiProperty({ type: PublicImageDto, nullable: true })
  image!: PublicImageDto | null;

  @ApiProperty({ description: 'Prix unitaire actuel, en centimes (toujours fixé par le serveur)' })
  unitPriceCents!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  lineTotalCents!: number;

  @ApiProperty({ type: AvailabilityDto })
  availability!: AvailabilityDto;

  @ApiProperty({ description: 'Quantité maximale commandable maintenant (stock et plafond)' })
  maxQuantity!: number;

  @ApiProperty({
    nullable: true,
    type: String,
    enum: ['unavailable', 'insufficient_stock'],
    description: 'Problème à corriger avant de commander',
  })
  issue!: 'unavailable' | 'insufficient_stock' | null;
}

export class ShippingOptionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Colissimo' })
  name!: string;

  @ApiProperty({ enum: ShippingMethod })
  method!: ShippingMethod;

  @ApiProperty({ description: 'Frais en centimes (0 si offerts ou retrait)' })
  priceCents!: number;

  @ApiProperty({ nullable: true, type: String, example: '2 à 4 jours ouvrés' })
  delay!: string | null;

  @ApiProperty({ description: 'Livraison offerte grâce au montant du panier' })
  free!: boolean;
}

export class CartDto {
  @ApiProperty({ type: [CartLineDto] })
  items!: CartLineDto[];

  @ApiProperty({ description: 'Nombre d’articles (badge du panier)' })
  itemCount!: number;

  @ApiProperty()
  subtotalCents!: number;

  @ApiProperty()
  weightGrams!: number;

  @ApiProperty({ type: [ShippingOptionDto], description: 'Selon le pays demandé (?country=)' })
  shippingOptions!: ShippingOptionDto[];

  @ApiProperty({ nullable: true, type: String, description: 'Adresse et horaires du retrait' })
  pickupDetails!: string | null;

  @ApiProperty({ description: 'Le panier peut être commandé tel quel' })
  checkoutReady!: boolean;
}

export class CheckoutAddressDto {
  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(200)
  line2?: string | null;

  @ApiProperty({ example: '94000' })
  @Trim()
  @Matches(/^[A-Za-z0-9 -]{3,10}$/, { message: 'fr: code postal invalide' })
  postalCode!: string;

  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'FR' })
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'fr: code pays à deux lettres (FR, BE…)' })
  country!: string;
}

export class CheckoutDto {
  @ApiPropertyOptional({
    description: 'E-mail de la commande : obligatoire sans compte, ignoré si connectée',
  })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ example: 'Awa' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Diallo' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({ example: '+33612345678' })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @Matches(PHONE_PATTERN, PHONE_MESSAGE)
  phone?: string | null;

  @ApiProperty({ description: 'Option de livraison choisie (liste du panier)' })
  @IsUUID()
  shippingRateId!: string;

  @ApiPropertyOptional({
    type: CheckoutAddressDto,
    description: 'Obligatoire pour une livraison',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  shippingAddress?: CheckoutAddressDto;

  @ApiPropertyOptional({
    type: CheckoutAddressDto,
    description: 'Facturation ; par défaut l’adresse de livraison (obligatoire pour un retrait)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  billingAddress?: CheckoutAddressDto;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @ApiProperty({ description: 'Acceptation des conditions générales de vente' })
  @Equals(true, { message: 'fr: les conditions générales de vente doivent être acceptées' })
  acceptTerms!: boolean;

  @ApiPropertyOptional({ description: 'Jeton Cloudflare Turnstile (obligatoire en production)' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}

export class CheckoutResultDto {
  @ApiProperty()
  orderId!: string;

  @ApiProperty({ example: 'CMD-000042' })
  reference!: string;

  @ApiProperty()
  totalCents!: number;

  @ApiProperty({ description: 'Le stock est réservé jusqu’à cette date (paiement à effectuer)' })
  reservationExpiresAt!: Date;

  @ApiProperty({
    description:
      'Jeton du lien de suivi (commande invitée) : à conserver, il donne accès à la commande',
  })
  trackingToken!: string;
}
