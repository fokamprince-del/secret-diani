import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { clientContext } from '../common/auth/client-context';
import { CurrentUser, Public, Roles } from '../common/auth/decorators';
import { ErrorResponseDto } from '../common/errors/error-response';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.constants';
import { type AuthenticatedOutcome, AuthService } from './auth.service';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  EmailDto,
  LoginDto,
  MfaCodeDto,
  MfaTokenDto,
  MfaVerifyDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
  TotpCodeDto,
} from './dto/auth.dto';
import {
  AuthenticatedResponseDto,
  BackupCodesResponseDto,
  MessageResponseDto,
  MfaChallengeResponseDto,
  MfaEnrolledResponseDto,
  MfaEnrollmentResponseDto,
} from './dto/auth-responses.dto';
import { CSRF_HEADER, CsrfGuard } from './guards/csrf.guard';

const MINUTE = 60_000;
const limit = (count: number) => Throttle({ default: { limit: count, ttl: MINUTE } });

/** Cookie du refresh token : inaccessible au JavaScript, HTTPS uniquement, jamais envoyé par un site tiers. */
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
};

const csrfHeader = ApiHeader({
  name: CSRF_HEADER,
  required: true,
  description: 'Valeur quelconque non vide (protection CSRF des routes à cookie)',
});

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length <= 128 ? value : undefined;
}

@ApiTags('Authentification')
@ApiExtraModels(AuthenticatedResponseDto, MfaChallengeResponseDto)
@ApiBadRequestResponse({ type: ErrorResponseDto })
@ApiTooManyRequestsResponse({ type: ErrorResponseDto })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setSessionCookie(res: Response, outcome: AuthenticatedOutcome): void {
    res.cookie(REFRESH_COOKIE, outcome.session.refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      expires: outcome.session.refreshExpiresAt,
    });
  }

  private clearSessionCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
  }

  // --- Inscription -----------------------------------------------------------------------

  @Public()
  @limit(5)
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Créer un compte',
    description:
      'Réponse identique que l’adresse soit libre ou non (anti-énumération). Un e-mail de confirmation est envoyé.',
  })
  @ApiAcceptedResponse({ type: MessageResponseDto })
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<MessageResponseDto> {
    return this.auth.register(dto, clientContext(req));
  }

  @Public()
  @limit(10)
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmer l’adresse e-mail (lien reçu par e-mail)' })
  @ApiOkResponse({ type: MessageResponseDto })
  verifyEmail(@Body() dto: TokenDto, @Req() req: Request): Promise<MessageResponseDto> {
    return this.auth.verifyEmail(dto.token, clientContext(req));
  }

  @Public()
  @limit(3)
  @Post('email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Renvoyer l’e-mail de confirmation (3 envois par heure au plus)' })
  @ApiAcceptedResponse({ type: MessageResponseDto })
  resendVerification(@Body() dto: EmailDto): Promise<MessageResponseDto> {
    return this.auth.resendVerification(dto.email);
  }

  // --- Connexion -------------------------------------------------------------------------

  @Public()
  @limit(10)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Se connecter',
    description:
      'Client : jeton d’accès + cookie de session. Administrateur : défi de second facteur (mfa_required ou mfa_enrollment_required).',
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AuthenticatedResponseDto) },
        { $ref: getSchemaPath(MfaChallengeResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Identifiants incorrects' })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'E-mail non confirmé ou compte suspendu',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedResponseDto | MfaChallengeResponseDto> {
    const outcome = await this.auth.login(dto, clientContext(req));
    if (outcome.kind === 'authenticated') this.setSessionCookie(res, outcome);
    return outcome.body;
  }

  @Public()
  @limit(10)
  @Post('2fa/enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Administrateur, première connexion : générer le secret TOTP' })
  @ApiOkResponse({ type: MfaEnrollmentResponseDto })
  startMfaEnrollment(@Body() dto: MfaTokenDto): Promise<MfaEnrollmentResponseDto> {
    return this.auth.startMfaEnrollment(dto.mfaToken);
  }

  @Public()
  @limit(10)
  @Post('2fa/enroll/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Administrateur, première connexion : valider le premier code et ouvrir la session',
  })
  @ApiOkResponse({ type: MfaEnrolledResponseDto })
  async confirmMfaEnrollment(
    @Body() dto: MfaCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MfaEnrolledResponseDto> {
    const outcome = await this.auth.confirmMfaEnrollment(
      dto.mfaToken,
      dto.code,
      clientContext(req),
    );
    this.setSessionCookie(res, outcome);
    return { ...outcome.body, backupCodes: outcome.backupCodes };
  }

  @Public()
  @limit(10)
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Administrateur : valider le code TOTP (ou un code de secours)' })
  @ApiOkResponse({ type: AuthenticatedResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Code invalide ou défi expiré' })
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedResponseDto> {
    const outcome = await this.auth.verifyMfa(dto, clientContext(req));
    this.setSessionCookie(res, outcome);
    return outcome.body;
  }

  @Roles('admin')
  @ApiBearerAuth()
  @limit(5)
  @Post('2fa/backup-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Administrateur : remplacer les codes de secours' })
  @ApiOkResponse({ type: BackupCodesResponseDto })
  async regenerateBackupCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TotpCodeDto,
  ): Promise<BackupCodesResponseDto> {
    return { backupCodes: await this.auth.regenerateBackupCodes(user, dto.code) };
  }

  // --- Session ---------------------------------------------------------------------------

  @Public()
  @UseGuards(CsrfGuard)
  @limit(30)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @csrfHeader
  @ApiOperation({
    summary: 'Renouveler le jeton d’accès',
    description:
      'Le refresh token (cookie) est à usage unique et renouvelé à chaque appel. Un jeton déjà utilisé révoque toute la session.',
  })
  @ApiOkResponse({ type: AuthenticatedResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Session expirée' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedResponseDto> {
    try {
      const outcome = await this.auth.refresh(readRefreshCookie(req), clientContext(req));
      this.setSessionCookie(res, outcome);
      return outcome.body;
    } catch (error) {
      this.clearSessionCookie(res);
      throw error;
    }
  }

  @Public()
  @UseGuards(CsrfGuard)
  @limit(30)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @csrfHeader
  @ApiOperation({ summary: 'Se déconnecter de cet appareil' })
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(readRefreshCookie(req), clientContext(req));
    this.clearSessionCookie(res);
  }

  @ApiBearerAuth()
  @limit(10)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Se déconnecter de tous les appareils' })
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user, clientContext(req));
    this.clearSessionCookie(res);
  }

  // --- Mot de passe ----------------------------------------------------------------------

  @Public()
  @limit(5)
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Mot de passe oublié : recevoir un lien (valable 30 minutes)' })
  @ApiAcceptedResponse({ type: MessageResponseDto })
  forgotPassword(@Body() dto: EmailDto, @Req() req: Request): Promise<MessageResponseDto> {
    return this.auth.forgotPassword(dto.email, clientContext(req));
  }

  @Public()
  @limit(10)
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Choisir un nouveau mot de passe (lien reçu par e-mail)',
    description: 'Toutes les sessions sont déconnectées.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<MessageResponseDto> {
    return this.auth.resetPassword(dto, clientContext(req));
  }

  @ApiBearerAuth()
  @limit(10)
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Changer mon mot de passe',
    description: 'Les autres appareils sont déconnectés ; la session courante est conservée.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ): Promise<MessageResponseDto> {
    return this.auth.changePassword(user, dto, clientContext(req));
  }

  // --- Adresse e-mail --------------------------------------------------------------------

  @ApiBearerAuth()
  @limit(5)
  @Post('email/change')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Changer mon adresse e-mail (confirmation par la nouvelle adresse)' })
  @ApiAcceptedResponse({ type: MessageResponseDto })
  requestEmailChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeEmailDto,
    @Req() req: Request,
  ): Promise<MessageResponseDto> {
    return this.auth.requestEmailChange(user, dto, clientContext(req));
  }

  @Public()
  @limit(10)
  @Post('email/change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmer la nouvelle adresse e-mail',
    description: 'Toutes les sessions sont déconnectées.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  confirmEmailChange(@Body() dto: TokenDto, @Req() req: Request): Promise<MessageResponseDto> {
    return this.auth.confirmEmailChange(dto.token, clientContext(req));
  }
}
