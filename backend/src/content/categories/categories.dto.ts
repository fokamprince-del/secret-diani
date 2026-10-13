import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
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
import { SLUG_PATTERN } from '../markdown/slug';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Pâtisserie', maxLength: 120 })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Généré depuis le nom si absent' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: 'fr: uniquement des minuscules, chiffres et tirets' })
  slug?: string;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
