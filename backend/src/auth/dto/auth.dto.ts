import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { NormalizeEmail, Trim } from '../../common/utils/transforms';
import { PASSWORD_MAX_LENGTH } from '../password/password-policy';

/** Jetons opaques transmis par lien (base64url, 256 bits). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;
const TOKEN_MESSAGE = { message: 'fr: lien invalide ou incomplet' };

export class EmailDto {
  @ApiProperty({ example: 'cliente@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ResetCodeDto extends EmailDto {
  @ApiProperty({ example: '482913', description: 'Code à 6 chiffres reçu par e-mail' })
  @Matches(/^\d{6}$/, { message: 'le code compte 6 chiffres' })
  code!: string;
}

export class RegisterDto extends EmailDto {
  @ApiProperty({
    minLength: 12,
    maxLength: PASSWORD_MAX_LENGTH,
    description: '12 caractères minimum ; les mots de passe courants sont refusés.',
  })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({ example: 'Awa', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Diallo', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ description: 'Acceptation des CGU et de la politique de confidentialité' })
  @Equals(true, { message: 'fr: vous devez accepter les conditions générales pour continuer' })
  acceptTerms!: boolean;

  @ApiPropertyOptional({ description: 'Accepte de recevoir des nouvelles par e-mail' })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class LoginDto extends EmailDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class TokenDto {
  @ApiProperty({ description: 'Jeton reçu par e-mail' })
  @IsString()
  @Matches(TOKEN_PATTERN, TOKEN_MESSAGE)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 12, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({ minLength: 12, maxLength: PASSWORD_MAX_LENGTH })
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}

export class ChangeEmailDto {
  @ApiProperty({ example: 'nouvelle-adresse@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  newEmail!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;
}

export class MfaTokenDto {
  @ApiProperty({ description: 'Jeton de défi reçu après le mot de passe (valable 5 minutes)' })
  @IsString()
  @Matches(TOKEN_PATTERN, { message: 'fr: vérification invalide' })
  mfaToken!: string;
}

export class MfaCodeDto extends MfaTokenDto {
  @ApiProperty({ example: '123456', description: 'Code à 6 chiffres de l’application' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'fr: le code doit contenir 6 chiffres' })
  code!: string;
}

export class MfaVerifyDto extends MfaTokenDto {
  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'fr: le code doit contenir 6 chiffres' })
  code?: string;

  @ApiPropertyOptional({ example: 'abcde-fghij', description: 'Code de secours (usage unique)' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9 -]{10,14}$/, { message: 'fr: code de secours invalide' })
  backupCode?: string;
}

export class TotpCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'fr: le code doit contenir 6 chiffres' })
  code!: string;
}
