import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: 'Opération effectuée.' })
  message!: string;
}

export class AuthUserDto {
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

  @ApiProperty()
  mfaEnabled!: boolean;
}

export class AuthenticatedResponseDto {
  @ApiProperty({ enum: ['authenticated'] })
  status!: 'authenticated';

  @ApiProperty({ description: 'Jeton d’accès (à garder en mémoire, jamais dans localStorage)' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Validité du jeton d’accès, en secondes' })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class MfaChallengeResponseDto {
  @ApiProperty({
    enum: ['mfa_required', 'mfa_enrollment_required'],
    description: 'Administrateur : second facteur à saisir, ou à configurer (première connexion)',
  })
  status!: 'mfa_required' | 'mfa_enrollment_required';

  @ApiProperty({ description: 'Jeton de défi, valable 5 minutes' })
  mfaToken!: string;
}

export class MfaEnrollmentResponseDto {
  @ApiProperty({ description: 'Secret à saisir dans l’application d’authentification' })
  secret!: string;

  @ApiProperty({ description: 'URI otpauth:// à afficher sous forme de QR code' })
  otpauthUrl!: string;
}

export class BackupCodesResponseDto {
  @ApiProperty({
    type: [String],
    description: 'Codes de secours à usage unique : affichés une seule fois',
  })
  backupCodes!: string[];
}

export class MfaEnrolledResponseDto extends AuthenticatedResponseDto {
  @ApiProperty({ type: [String], description: 'Codes de secours, affichés une seule fois' })
  backupCodes!: string[];
}
