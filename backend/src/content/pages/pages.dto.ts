import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/utils/transforms';

export class UpsertPageDto {
  @ApiProperty({ example: 'Mentions légales', maxLength: 200 })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: 'Contenu en Markdown', maxLength: 60000 })
  @IsString()
  @MinLength(1)
  @MaxLength(60_000)
  bodyMarkdown!: string;

  @ApiProperty({ description: 'Visible sur le site' })
  @IsBoolean()
  published!: boolean;

  @ApiPropertyOptional({ maxLength: 70, nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 160, nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null;
}

export class AdminPageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  bodyMarkdown!: string;

  @ApiProperty()
  published!: boolean;

  @ApiProperty({ nullable: true, type: String })
  seoTitle!: string | null;

  @ApiProperty({ nullable: true, type: String })
  seoDescription!: string | null;

  @ApiProperty()
  updatedAt!: Date;
}
