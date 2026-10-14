import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { ReviewStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Equals,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../common/utils/transforms';

/** Avis saisi par l'administration à partir d'un message réel de la cliente (aucun avis inventé). */
export class CreateReviewDto {
  @ApiProperty({ example: 'Awa D.', description: 'Nom affiché, tel qu’autorisé par la cliente' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  authorName!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({ maxLength: 2000 })
  @Trim()
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Anniversaire, 40 personnes',
    maxLength: 120,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  occasion?: string | null;

  @ApiProperty({ example: '2026-09-12', description: 'Date de réception de l’avis' })
  @IsDateString({ strict: true })
  receivedOn!: string;

  @ApiProperty({
    example: 'Message WhatsApp du 12/09',
    description: 'Provenance (interne, jamais publiée) : obligatoire',
  })
  @Trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  sourceNote!: string;

  @ApiProperty({ description: 'La cliente a accepté la publication de son avis' })
  @Equals(true, { message: 'fr: la publication doit avoir été acceptée par la cliente' })
  consentConfirmed!: boolean;
}

export class UpdateReviewDto extends PartialType(OmitType(CreateReviewDto, ['consentConfirmed'])) {}

export class ModerateReviewDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';
}

export class AdminReviewQueryDto {
  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}

export class PublicReviewQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AdminReviewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  authorName!: string;

  @ApiProperty()
  rating!: number;

  @ApiProperty()
  content!: string;

  @ApiProperty({ nullable: true, type: String })
  occasion!: string | null;

  @ApiProperty()
  receivedOn!: Date;

  @ApiProperty()
  sourceNote!: string;

  @ApiProperty({ enum: ReviewStatus })
  status!: ReviewStatus;

  @ApiProperty()
  position!: number;

  @ApiProperty({ nullable: true, type: Date })
  moderatedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
