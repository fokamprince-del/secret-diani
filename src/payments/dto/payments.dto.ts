import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider, PaymentStatus, RefundStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/utils/transforms';
import { OrderDto } from '../../shop/dto/orders.dto';

const TOKEN_MESSAGE = { message: 'fr: lien de commande invalide' };

export class PaymentMethodsDto {
  @ApiProperty({ description: 'Carte bancaire, Apple Pay, Google Pay… via Stripe Checkout' })
  stripe!: boolean;

  @ApiProperty()
  paypal!: boolean;
}

export class StartPaymentDto {
  @ApiProperty({ description: 'Jeton de la commande reçu à la validation du panier (lien signé)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,100}$/, TOKEN_MESSAGE)
  token!: string;

  @ApiProperty({ enum: PaymentProvider })
  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;
}

export class StartedPaymentDto {
  @ApiProperty()
  paymentId!: string;

  @ApiProperty({ enum: PaymentProvider })
  provider!: PaymentProvider;

  @ApiProperty({ description: 'Page de paiement hébergée par le prestataire (redirection)' })
  redirectUrl!: string;

  @ApiProperty({ description: 'La page de paiement expire à cette date' })
  expiresAt!: Date;
}

export class CapturePayPalDto {
  @ApiProperty({ description: 'Jeton de la commande (paramètre « suivi » de l’URL de retour)' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,100}$/, TOKEN_MESSAGE)
  token!: string;
}

export class PaymentResultDto {
  @ApiProperty({
    enum: [
      'paid',
      'already_processed',
      'unknown_payment',
      'amount_mismatch',
      'refunded_stock_unavailable',
      'refunded_duplicate',
    ],
  })
  outcome!: string;

  @ApiProperty({ type: OrderDto })
  order!: OrderDto;
}

export class WebhookAckDto {
  @ApiProperty()
  received!: boolean;

  @ApiProperty({ description: 'Événement déjà reçu (aucun nouveau traitement)' })
  duplicate!: boolean;
}

// --- Administration --------------------------------------------------------------------------

export class CreateRefundDto {
  @ApiPropertyOptional({
    description: 'Montant en centimes ; absent = tout le restant remboursable',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amountCents?: number;

  @ApiProperty({ example: 'Article arrivé abîmé' })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Remettre les articles en stock (remboursement intégral seulement)',
  })
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}

export class AdminRefundDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  amountCents!: number;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ enum: RefundStatus })
  status!: RefundStatus;

  @ApiProperty()
  restocked!: boolean;

  @ApiProperty({ nullable: true, type: String, description: 'NULL : remboursement automatique' })
  actorId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  failureReason!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminPaymentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PaymentProvider })
  provider!: PaymentProvider;

  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;

  @ApiProperty()
  amountCents!: number;

  @ApiProperty()
  refundedCents!: number;

  @ApiProperty({ nullable: true, type: String, description: 'Référence chez le prestataire' })
  providerPaymentId!: string | null;

  @ApiProperty({ nullable: true, type: Date })
  succeededAt!: Date | null;

  @ApiProperty({ nullable: true, type: String })
  failureReason!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: [AdminRefundDto] })
  refunds!: AdminRefundDto[];
}
