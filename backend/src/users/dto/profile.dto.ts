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

  @ApiProperty({ description: 'Un mot de passe est défini (faux : compte créé avec Google)' })
  hasPassword!: boolean;

  @ApiProperty({ description: 'Connexion avec Google reliée au compte' })
  googleLinked!: boolean;

  @ApiProperty({ description: 'Consentement aux e-mails d’information' })
  marketingConsent!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

/** Champs modifiables du profil. Chaîne vide = effacer la valeur. */
export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @EmptyToNull()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  firstName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @EmptyToNull()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  lastName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '+33 6 12 34 56 78' })
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
  @ApiPropertyOptional({
    description:
      'Mot de passe actuel (confirmation). Compte sans mot de passe (Google) : omis, une connexion de moins de 15 minutes est exigée.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;
}
