import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, ShippingMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination/cursor';
import { EmptyToNull, Trim } from '../../common/utils/transforms';
import { ADMIN_STATUSES, type AdminOrderStatus } from '../domain/order-status';

export class OrderAddressDto {
  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  line1!: string;

  @ApiProperty({ nullable: true, type: String })
  line2!: string | null;

  @ApiProperty()
  postalCode!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  country!: string;
}

export class OrderLineDto {
  @ApiProperty()
  productName!: string;

  @ApiProperty()
  variantLabel!: string;

  @ApiProperty({ nullable: true, type: String })
  sku!: string | null;

  @ApiProperty({ description: 'Prix unitaire figé à l’achat, en centimes' })
  unitPriceCents!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  lineTotalCents!: number;
}

export class OrderEventDto {
  @ApiProperty({ enum: OrderStatus, nullable: true })
  fromStatus!: OrderStatus | null;

  @ApiProperty({ enum: OrderStatus })
  toStatus!: OrderStatus;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class OrderSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'CMD-000042' })
  reference!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ example: 'Payée' })
  statusLabel!: string;

  @ApiProperty()
  totalCents!: number;

  @ApiProperty()
  itemCount!: number;

  @ApiProperty()
  createdAt!: Date;
}

/** Commande vue par la cliente (espace membre ou lien de suivi). */
export class OrderDto extends OrderSummaryDto {
  @ApiProperty({ type: [OrderLineDto] })
  items!: OrderLineDto[];

  @ApiProperty()
  subtotalCents!: number;

  @ApiProperty()
  shippingCents!: number;

  @ApiProperty()
  refundedCents!: number;

  @ApiProperty({ enum: ShippingMethod })
  shippingMethod!: ShippingMethod;

  @ApiProperty()
  shippingRateName!: string;

  @ApiProperty({ type: OrderAddressDto, nullable: true })
  shippingAddress!: OrderAddressDto | null;

  @ApiProperty({ nullable: true, type: String })
  carrier!: string | null;

  @ApiProperty({ nullable: true, type: String })
  trackingNumber!: string | null;

  @ApiProperty({ nullable: true, type: Date, description: 'Paiement attendu avant cette date' })
  reservationExpiresAt!: Date | null;

  @ApiProperty({ nullable: true, type: Date })
  paidAt!: Date | null;

  @ApiProperty({ nullable: true, type: Date })
  shippedAt!: Date | null;

  @ApiProperty({ nullable: true, type: Date })
  deliveredAt!: Date | null;

  @ApiProperty({ description: 'Une facture est disponible au téléchargement' })
  invoiceAvailable!: boolean;

  @ApiProperty({ type: [OrderEventDto], description: 'Étapes de la commande' })
  timeline!: OrderEventDto[];
}

export class OrderListDto {
  @ApiProperty({ type: [OrderSummaryDto] })
  items!: OrderSummaryDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
}

export class TrackOrderQueryDto {
  @ApiProperty({ description: 'Jeton du lien de suivi reçu par e-mail' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,100}$/, { message: 'fr: lien de suivi invalide' })
  token!: string;
}

export class DownloadUrlDto {
  @ApiProperty({ description: 'URL signée, valable 5 minutes' })
  url!: string;
}

// --- Administration --------------------------------------------------------------------------

export class AdminOrderQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Commandes passées à partir de cette date (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Commandes passées jusqu’à cette date incluse (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiPropertyOptional({ description: 'Référence (CMD-000042), e-mail ou nom' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(254)
  q?: string;
}

export class AdminOrderExportQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'AAAA-MM-JJ' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'AAAA-MM-JJ (inclus)' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class ChangeOrderStatusDto {
  @ApiProperty({ enum: ADMIN_STATUSES })
  @IsIn(ADMIN_STATUSES)
  status!: AdminOrderStatus;

  @ApiPropertyOptional({ description: 'Transporteur (expédition)', example: 'Colissimo' })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(60)
  carrier?: string | null;

  @ApiPropertyOptional({ description: 'Numéro de suivi (expédition)' })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  trackingNumber?: string | null;

  @ApiPropertyOptional({ description: 'Note d’historique (motif d’annulation…)', maxLength: 500 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class AdminOrderSummaryDto extends OrderSummaryDto {
  @ApiProperty()
  email!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty({ description: 'Commande passée avec un compte' })
  hasAccount!: boolean;
}

export class AdminOrderListDto {
  @ApiProperty({ type: [AdminOrderSummaryDto] })
  items!: AdminOrderSummaryDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
}

export class AdminOrderDto extends OrderDto {
  @ApiProperty()
  email!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String })
  userId!: string | null;

  @ApiProperty({ type: OrderAddressDto })
  billingAddress!: OrderAddressDto;

  @ApiProperty({ nullable: true, type: String })
  customerNote!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'F-2026-00001' })
  invoiceNumber!: string | null;

  @ApiProperty({ nullable: true, type: String })
  cancellationReason!: string | null;

  @ApiProperty({
    enum: ADMIN_STATUSES,
    isArray: true,
    description: 'Étapes que l’administration peut poser maintenant',
  })
  nextStatuses!: AdminOrderStatus[];
}
