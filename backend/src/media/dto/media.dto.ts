import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaKind, MediaStatus } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination/cursor';
import { Trim } from '../../common/utils/transforms';
import { ACCEPTED_TYPES, MAX_BYTES } from '../file-signature';

export class UploadMediaDto {
  @ApiPropertyOptional({
    maxLength: 300,
    description: 'Texte alternatif (vide si l’image est décorative)',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  alt?: string;
}

export class CreateUploadDto extends UploadMediaDto {
  @ApiProperty({ example: 'plateau-decouverte.jpg', maxLength: 255 })
  @Trim()
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ enum: Object.keys(ACCEPTED_TYPES) })
  @IsIn(Object.keys(ACCEPTED_TYPES), { message: 'fr: type de fichier non accepté' })
  contentType!: string;

  @ApiProperty({ description: 'Taille exacte du fichier, en octets', example: 2_500_000 })
  @IsInt()
  @Min(1)
  @Max(MAX_BYTES.document)
  size!: number;
}

export class UpdateMediaDto {
  @ApiProperty({ maxLength: 300 })
  @Trim()
  @IsString()
  @MaxLength(300)
  alt!: string;
}

export class MediaQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: MediaKind })
  @IsOptional()
  @IsEnum(MediaKind)
  kind?: MediaKind;

  @ApiPropertyOptional({ enum: MediaStatus })
  @IsOptional()
  @IsEnum(MediaStatus)
  status?: MediaStatus;
}

class MediaVariantDto {
  @ApiProperty({ enum: ['avif', 'webp'] })
  format!: string;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  url!: string;
}

export class MediaDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: MediaKind })
  kind!: MediaKind;

  @ApiProperty({ enum: MediaStatus })
  status!: MediaStatus;

  @ApiProperty()
  originalName!: string;

  @ApiProperty({ nullable: true, type: String })
  mimeType!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  sizeBytes!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  width!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  height!: number | null;

  @ApiProperty()
  alt!: string;

  @ApiProperty({ type: [MediaVariantDto] })
  variants!: MediaVariantDto[];

  @ApiProperty({ nullable: true, type: String })
  blurDataUrl!: string | null;

  @ApiProperty({ nullable: true, type: String })
  rejectionReason!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'clean | skipped' })
  scanResult!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PresignedUploadDto {
  @ApiProperty({ type: MediaDto })
  media!: MediaDto;

  @ApiProperty({ description: 'URL d’envoi (PUT), valable 10 minutes' })
  uploadUrl!: string;

  @ApiProperty({
    description: 'En-têtes à envoyer tels quels avec le PUT',
    example: { 'Content-Type': 'image/jpeg' },
  })
  headers!: Record<string, string>;
}

export class DownloadUrlDto {
  @ApiProperty({ description: 'URL signée, valable 5 minutes' })
  url!: string;
}
