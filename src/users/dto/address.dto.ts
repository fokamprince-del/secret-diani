import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AddressType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../common/utils/transforms';
import { PHONE_PATTERN } from './profile.dto';

export class CreateAddressDto {
  @ApiProperty({ enum: AddressType })
  @IsEnum(AddressType)
  type!: AddressType;

  @ApiPropertyOptional({ example: 'Maison', maxLength: 50 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty({ maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: '12 rue des Lilas', maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty({ example: '75011' })
  @Trim()
  @IsString()
  @Matches(/^[A-Za-z0-9 -]{3,10}$/, { message: 'fr: doit être un code postal valide' })
  postalCode!: string;

  @ApiProperty({ example: 'Paris', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional({
    example: 'FR',
    default: 'FR',
    description: 'Code pays ISO 3166-1 alpha-2',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'fr: doit être un code pays à 2 lettres (ex. FR)' })
  country?: string;

  @ApiPropertyOptional({ example: '+33 6 12 34 56 78' })
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'fr: doit être un numéro de téléphone valide' })
  phone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

export class AddressDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: AddressType })
  type!: AddressType;

  @ApiProperty({ nullable: true, type: String })
  label!: string | null;

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

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty()
  isDefault!: boolean;
}
