import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../auth/password/password-policy';
import { EmptyToNull } from '../../common/utils/transforms';

export const PHONE_PATTERN = /^\+?[0-9][0-9 .-]{5,18}$/;
const PHONE_MESSAGE = { message: 'fr: doit être un numéro de téléphone valide' };

export class ProfileDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'cliente@example.com' })
  email!: string;

  @ApiProperty({ enum: ['client', 'admin'] })
  role!: 'client' | 'admin';

  @ApiProperty({ nullable: true, type: String })
  firstName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lastName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty()
  mfaEnabled!: boolean;

  @ApiProperty({ description: 'Consentement aux e-mails d’information' })
  marketingConsent!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

/** Champs modifiables du profil. Chaîne vide = effacer la valeur. */
export class UpdateProfileDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @IsOptional()
  @EmptyToNull()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  firstName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @IsOptional()
  @EmptyToNull()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  lastName?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+33 6 12 34 56 78' })
  @IsOptional()
  @EmptyToNull()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(PHONE_PATTERN, PHONE_MESSAGE)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class DeleteAccountDto {
  @ApiProperty({ description: 'Mot de passe actuel (confirmation)' })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
