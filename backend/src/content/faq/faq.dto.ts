import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FaqCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/utils/transforms';

export class CreateFaqDto {
  @ApiProperty({ enum: FaqCategory })
  @IsEnum(FaqCategory)
  category!: FaqCategory;

  @ApiProperty({ maxLength: 300 })
  @Trim()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  question!: string;

  @ApiProperty({ description: 'Réponse en Markdown', maxLength: 5000 })
  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  answerMarkdown!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateFaqDto extends PartialType(CreateFaqDto) {}

export class FaqQueryDto {
  @ApiPropertyOptional({ enum: FaqCategory })
  @IsOptional()
  @IsEnum(FaqCategory)
  category?: FaqCategory;
}

export class AdminFaqDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: FaqCategory })
  category!: FaqCategory;

  @ApiProperty()
  question!: string;

  @ApiProperty()
  answerMarkdown!: string;

  @ApiProperty()
  answerHtml!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  published!: boolean;
}
