import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { CateringFulfilment, CateringRequestSource, CateringRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
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
  ValidateNested,
} from 'class-validator';
import { CursorQueryDto } from '../../common/pagination/cursor';
import { EmptyToNull, NormalizeEmail, Trim } from '../../common/utils/transforms';
import { PHONE_PATTERN } from '../../users/dto/profile.dto';

const PHONE_MESSAGE = { message: 'fr: doit être un numéro de téléphone valide' };
const DATE_MESSAGE = { message: 'fr: doit être une date au format AAAA-MM-JJ' };

export class RequestItemInputDto {
  @ApiProperty({ description: 'Variante choisie (taille, conditionnement)' })
  @IsUUID()
  variantId!: string;

  @ApiProperty({ minimum: 1, maximum: 50, example: 1 })
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  @ApiPropertyOptional({ type: [String], description: 'Parfums choisis (layer cakes)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  flavourIds?: string[];
}

/** Coordonnées et besoin, communs au formulaire public et à la saisie par l'administration. */
class RequestContactDto {
  @ApiProperty({ example: 'Awa' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Diallo' })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(100)
  lastName?: string | null;

  @ApiProperty({ example: 'cliente@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '+33612345678' })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @Matches(PHONE_PATTERN, PHONE_MESSAGE)
  phone?: string | null;

  @ApiProperty({ example: '2026-11-14', description: 'Date de l’événement' })
  @IsDateString({ strict: true }, DATE_MESSAGE)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, DATE_MESSAGE)
  eventDate!: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: 5000, example: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  guestCount?: number | null;

  @ApiPropertyOptional({ enum: CateringFulfilment })
  @IsOptional()
  @IsEnum(CateringFulfilment)
  fulfilment?: CateringFulfilment | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ville ou adresse (livraison seulement)',
    maxLength: 300,
  })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(300)
  deliveryAddress?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 3000 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(3000)
  message?: string | null;

  @ApiPropertyOptional({
    type: [RequestItemInputDto],
    description: 'Sélection facultative (le total estimé est calculé par le serveur)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RequestItemInputDto)
  items?: RequestItemInputDto[];
}

/** Formulaire public « Demande personnalisée ». */
export class CreateCateringRequestDto extends RequestContactDto {
  @ApiPropertyOptional({ description: 'Jeton Cloudflare Turnstile (obligatoire en production)' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;

  @ApiPropertyOptional({
    description: 'Piège à robots : champ caché, toujours vide pour un humain',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}

/** Commande en ligne (parcours avancé, CATERING_ONLINE_ORDERING) : sélection et créneau obligatoires. */
export class CreateOnlineCateringOrderDto extends CreateCateringRequestDto {
  @ApiProperty({ description: 'Créneau de retrait ou de livraison' })
  @IsUUID()
  slotId!: string;
}

export class CateringRequestReceiptDto {
  @ApiProperty({ example: 'TR-000042' })
  reference!: string;

  @ApiProperty({
    example: 'Merci ! Votre demande est bien reçue : Diani vous recontacte rapidement.',
  })
  message!: string;

  @ApiProperty({ nullable: true, type: Number, description: 'Total estimé de la sélection' })
  estimatedTotalCents!: number | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Prolonger l’échange sur WhatsApp (message pré-rempli avec la référence)',
  })
  whatsappUrl!: string | null;
}

export class CateringSlotDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: CateringFulfilment })
  fulfilment!: CateringFulfilment;

  @ApiProperty()
  startsAt!: Date;

  @ApiProperty()
  endsAt!: Date;

  @ApiProperty({ description: 'Places restantes' })
  remaining!: number;
}

export class SlotQueryDto {
  @ApiPropertyOptional({ enum: CateringFulfilment })
  @IsOptional()
  @IsEnum(CateringFulfilment)
  fulfilment?: CateringFulfilment;
}

// --- Administration --------------------------------------------------------------------------

/** Demande reçue hors du site (WhatsApp, téléphone) et saisie par l'administration. */
export class AdminCreateCateringRequestDto extends RequestContactDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string | null;
}

export class AdminUpdateCateringRequestDto extends PartialType(
  PickType(AdminCreateCateringRequestDto, [
    'firstName',
    'lastName',
    'email',
    'phone',
    'eventDate',
    'guestCount',
    'fulfilment',
    'deliveryAddress',
    'internalNotes',
  ] as const),
) {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Total convenu en centimes (base de l’acompte ; figé une fois l’acompte reçu)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  agreedTotalCents?: number | null;
}

export class RecordDepositDto {
  @ApiPropertyOptional({
    description: 'Total convenu en centimes, s’il n’est pas encore enregistré',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  agreedTotalCents?: number;

  @ApiProperty({ example: 'Virement', description: 'Moyen de paiement de l’acompte' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  method!: string;
}

export class ChangeRequestStatusDto {
  @ApiProperty({
    enum: ['contacted', 'confirmed', 'delivered', 'cancelled'],
    description: '« Acompte reçu » passe par l’enregistrement de l’acompte',
  })
  @IsIn(['contacted', 'confirmed', 'delivered', 'cancelled'])
  status!: 'contacted' | 'confirmed' | 'delivered' | 'cancelled';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Note d’historique (motif d’annulation…)',
    maxLength: 500,
  })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class AdminCateringRequestQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: CateringRequestStatus })
  @IsOptional()
  @IsEnum(CateringRequestStatus)
  status?: CateringRequestStatus;

  @ApiPropertyOptional({ description: 'Événements à partir de cette date (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({ strict: true }, DATE_MESSAGE)
  from?: string;

  @ApiPropertyOptional({ description: 'Événements jusqu’à cette date incluse (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString({ strict: true }, DATE_MESSAGE)
  to?: string;

  @ApiPropertyOptional({ description: 'Référence (TR-000042) ou adresse e-mail' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(254)
  q?: string;
}

export class AdminRequestItemDto {
  @ApiProperty()
  productName!: string;

  @ApiProperty()
  variantLabel!: string;

  @ApiProperty()
  unitPriceCents!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ type: [String] })
  flavours!: string[];
}

export class AdminRequestEventDto {
  @ApiProperty({ enum: CateringRequestStatus, nullable: true })
  fromStatus!: CateringRequestStatus | null;

  @ApiProperty({ enum: CateringRequestStatus })
  toStatus!: CateringRequestStatus;

  @ApiProperty({ nullable: true, type: String })
  actorId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminCateringRequestSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'TR-000042' })
  reference!: string;

  @ApiProperty({ enum: CateringRequestSource })
  source!: CateringRequestSource;

  @ApiProperty({ enum: CateringRequestStatus })
  status!: CateringRequestStatus;

  @ApiProperty()
  firstName!: string;

  @ApiProperty({ nullable: true, type: String })
  lastName!: string | null;

  @ApiProperty({ example: '2026-11-14' })
  eventDate!: string;

  @ApiProperty({ nullable: true, type: Number })
  guestCount!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  estimatedTotalCents!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  agreedTotalCents!: number | null;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminCateringRequestListDto {
  @ApiProperty({ type: [AdminCateringRequestSummaryDto] })
  items!: AdminCateringRequestSummaryDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
}

export class AdminCateringRequestDto extends AdminCateringRequestSummaryDto {
  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ enum: CateringFulfilment, nullable: true })
  fulfilment!: CateringFulfilment | null;

  @ApiProperty({ nullable: true, type: String })
  deliveryAddress!: string | null;

  @ApiProperty({ nullable: true, type: String })
  message!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Acompte enregistré, ou acompte calculé sur le total convenu (aperçu)',
  })
  depositCents!: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'Solde au retrait ou à la livraison' })
  balanceCents!: number | null;

  @ApiProperty({ nullable: true, type: Date })
  depositReceivedAt!: Date | null;

  @ApiProperty({ nullable: true, type: String })
  depositMethod!: string | null;

  @ApiProperty({ nullable: true, type: Date })
  confirmedAt!: Date | null;

  @ApiProperty({ nullable: true, type: Date })
  cancelledAt!: Date | null;

  @ApiProperty({ nullable: true, type: String })
  cancellationReason!: string | null;

  @ApiProperty({ nullable: true, type: String })
  internalNotes!: string | null;

  @ApiProperty({ nullable: true, type: CateringSlotDto })
  slot!: CateringSlotDto | null;

  @ApiProperty({ type: [AdminRequestItemDto] })
  items!: AdminRequestItemDto[];

  @ApiProperty({ type: [AdminRequestEventDto] })
  events!: AdminRequestEventDto[];

  @ApiProperty({
    enum: CateringRequestStatus,
    isArray: true,
    description: 'Statuts accessibles depuis le statut actuel',
  })
  nextStatuses!: CateringRequestStatus[];

  @ApiProperty({ nullable: true, type: String, description: 'Lien WhatsApp vers la cliente' })
  customerWhatsappUrl!: string | null;
}

export class RecapDto {
  @ApiProperty({ description: 'Récapitulatif prêt à copier (WhatsApp, e-mail)' })
  text!: string;
}

// --- Créneaux (administration) ---------------------------------------------------------------

export class CreateSlotDto {
  @ApiProperty({ enum: CateringFulfilment })
  @IsEnum(CateringFulfilment)
  fulfilment!: CateringFulfilment;

  @ApiProperty({ example: '2026-11-14T10:00:00+01:00' })
  @IsDateString({ strict: true })
  startsAt!: string;

  @ApiProperty({ example: '2026-11-14T12:00:00+01:00' })
  @IsDateString({ strict: true })
  endsAt!: string;

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity!: number;
}

export class UpdateSlotDto extends PartialType(CreateSlotDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class AdminSlotDto extends CateringSlotDto {
  @ApiProperty()
  capacity!: number;

  @ApiProperty()
  active!: boolean;
}
