import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import type { ClientContext } from '../common/auth/client-context';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { withMinDuration } from '../common/utils/timing';
import { AppConfigService } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { NewsletterService } from '../newsletter/newsletter.service';
import { PrismaService } from '../prisma/prisma.service';
import { type IssuedSession, SessionsService, sessionExpired } from '../sessions/sessions.service';
import {
  ANTI_ENUMERATION_MIN_MS,
  EMAIL_CHANGE_TTL_MS,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from './auth.constants';
import type {
  ChangeEmailDto,
  ChangePasswordDto,
  LoginDto,
  MfaVerifyDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import type {
  AuthenticatedResponseDto,
  AuthUserDto,
  MfaChallengeResponseDto,
  MfaEnrollmentResponseDto,
} from './dto/auth-responses.dto';
import { LoginAttemptsService } from './login-attempts.service';
import { MfaService, mfaError, tooManyCodes } from './mfa/mfa.service';
import { PasswordService } from './password/password.service';
import { AccessTokenService } from './tokens/access-token.service';
import { UserTokensService } from './tokens/user-tokens.service';

/** Résultat d'une authentification réussie : corps de réponse + session (pour le cookie). */
export interface AuthenticatedOutcome {
  body: AuthenticatedResponseDto;
  session: IssuedSession;
}

export type LoginOutcome =
  | ({ kind: 'authenticated' } & AuthenticatedOutcome)
  | { kind: 'challenge'; body: MfaChallengeResponseDto };

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  passwordHash: true,
  emailVerifiedAt: true,
  firstName: true,
  lastName: true,
  totpEnabledAt: true,
} satisfies Prisma.UserSelect;

type AuthUserRecord = Pick<User, keyof typeof USER_SELECT>;

export const MESSAGES = {
  registered:
    'Si cette adresse peut être utilisée, vous allez recevoir un e-mail pour confirmer votre inscription.',
  verificationSent:
    'Si un compte non confirmé correspond à cette adresse, un nouvel e-mail de confirmation vient d’être envoyé.',
  emailVerified: 'Votre adresse e-mail est confirmée. Vous pouvez vous connecter.',
  resetSent:
    'Si un compte correspond à cette adresse, vous allez recevoir un e-mail pour réinitialiser votre mot de passe.',
  passwordReset: 'Votre mot de passe a été modifié. Vous pouvez vous connecter.',
  passwordChanged: 'Votre mot de passe a été modifié. Vos autres appareils ont été déconnectés.',
  emailChangeSent:
    'Un e-mail de confirmation a été envoyé à la nouvelle adresse. Le changement sera effectif après confirmation.',
  emailChanged: 'Votre adresse e-mail a été modifiée. Merci de vous reconnecter.',
} as const;

function invalidCredentials(): AppException {
  return new AppException(
    HttpStatus.UNAUTHORIZED,
    ErrorCode.INVALID_CREDENTIALS,
    'E-mail ou mot de passe incorrect.',
  );
}

function formatParisDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date);
}

@Injectable()
export class AuthService {
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly attempts: LoginAttemptsService,
    private readonly sessions: SessionsService,
    private readonly accessTokens: AccessTokenService,
    private readonly userTokens: UserTokensService,
    private readonly mfa: MfaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly newsletter: NewsletterService,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL').replace(/\/$/, '');
  }

  private link(path: string, token?: string): string {
    return token ? `${this.siteUrl}${path}?token=${token}` : `${this.siteUrl}${path}`;
  }

  // ---------------------------------------------------------------------------
  // Inscription et vérification de l'e-mail
  // ---------------------------------------------------------------------------

  /**
   * Réponse identique, et de même durée, que l'adresse soit libre ou déjà utilisée
   * (anti-énumération). Si elle est utilisée, le titulaire reçoit un e-mail d'information.
   */
  async register(dto: RegisterDto, context: ClientContext): Promise<{ message: string }> {
    this.passwords.assertPolicy(dto.password, dto);
    return withMinDuration(ANTI_ENUMERATION_MIN_MS, async () => {
      // Le hachage a lieu dans tous les cas : même coût que l'adresse existe ou non.
      const passwordHash = await this.passwords.hash(dto.password);
      const now = new Date();
      try {
        const user = await this.prisma.user.create({
          data: {
            email: dto.email,
            passwordHash,
            firstName: dto.firstName ?? null,
            lastName: dto.lastName ?? null,
            termsAcceptedAt: now,
            termsVersion: this.config.get('TERMS_VERSION'),
            marketingConsentAt: dto.marketingConsent ? now : null,
          },
          select: { id: true, firstName: true },
        });
        const token = await this.userTokens.issue(
          user.id,
          'email_verification',
          EMAIL_VERIFICATION_TTL_MS,
        );
        await this.mail.send('verify-email', dto.email, {
          firstName: user.firstName,
          link: this.link('/verifier-email', token),
        });
        await this.audit.log({
          action: AuditAction.REGISTERED,
          actorId: user.id,
          targetType: 'user',
          targetId: user.id,
          ipTruncated: context.ipTruncated,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
        if (await this.userTokens.allowEmailSend('account-exists', dto.email)) {
          await this.mail.send('account-exists', dto.email, {
            loginLink: this.link('/connexion'),
            resetLink: this.link('/mot-de-passe-oublie'),
          });
        }
      }
      return { message: MESSAGES.registered };
    });
  }

  async verifyEmail(token: string, context: ClientContext): Promise<{ message: string }> {
    const { userId } = await this.userTokens.consume(token, 'email_verification');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
      select: { email: true, firstName: true },
    });
    await this.mail.send('welcome', user.email, {
      firstName: user.firstName,
      siteLink: this.link('/'),
    });
    // Consentement donné à l'inscription : adresse désormais vérifiée, abonnement confirmé.
    await this.newsletter.syncAccount(userId);
    await this.audit.log({
      action: AuditAction.EMAIL_VERIFIED,
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      ipTruncated: context.ipTruncated,
    });
    return { message: MESSAGES.emailVerified };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    return withMinDuration(ANTI_ENUMERATION_MIN_MS, async () => {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, firstName: true, status: true, emailVerifiedAt: true },
      });
      if (
        user &&
        user.status === 'active' &&
        !user.emailVerifiedAt &&
        (await this.userTokens.allowEmailSend('verify-email', email))
      ) {
        const token = await this.userTokens.issue(
          user.id,
          'email_verification',
          EMAIL_VERIFICATION_TTL_MS,
        );
        await this.mail.send('verify-email', email, {
          firstName: user.firstName,
          link: this.link('/verifier-email', token),
        });
      }
      return { message: MESSAGES.verificationSent };
    });
  }

  // ---------------------------------------------------------------------------
  // Connexion, second facteur, renouvellement, déconnexion
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto, context: ClientContext): Promise<LoginOutcome> {
    await this.attempts.assertAllowed(dto.email, context.ip);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: USER_SELECT,
    });
    // Vérification systématique (empreinte factice si le compte n'existe pas) : durée constante.
    const valid = await this.passwords.verify(user?.passwordHash, dto.password);

    if (!user || !valid || user.status === 'deleted') {
      const locked = await this.attempts.recordFailure(dto.email, context.ip);
      if (user) {
        await this.audit.log({
          action: locked ? AuditAction.LOGIN_LOCKED_OUT : AuditAction.LOGIN_FAILED,
          targetType: 'user',
          targetId: user.id,
          ipTruncated: context.ipTruncated,
        });
      }
      throw invalidCredentials();
    }
    await this.attempts.reset(dto.email, context.ip);

    // Les messages suivants ne sont donnés qu'à qui connaît le mot de passe : pas d'énumération.
    if (user.status === 'locked') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.ACCOUNT_LOCKED,
        'Votre compte est suspendu. Merci de nous contacter.',
      );
    }
    if (!user.emailVerifiedAt) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Merci de confirmer votre adresse e-mail avant de vous connecter. Vous pouvez demander un nouveau lien.',
      );
    }
    if (user.passwordHash && this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(dto.password) },
      });
    }

    if (user.role === 'admin') {
      await this.attempts.assertAllowed(`mfa:${user.id}`, context.ip);
      const purpose = user.totpEnabledAt ? 'verify' : 'enroll';
      const mfaToken = await this.mfa.createChallenge(user.id, purpose);
      return {
        kind: 'challenge',
        body: {
          status: purpose === 'verify' ? 'mfa_required' : 'mfa_enrollment_required',
          mfaToken,
        },
      };
    }

    return { kind: 'authenticated', ...(await this.openSession(user, false, context)) };
  }

  async startMfaEnrollment(mfaToken: string): Promise<MfaEnrollmentResponseDto> {
    // Le libellé du compte dans l'application d'authentification reste générique (pas d'e-mail).
    return this.mfa.startEnrollment(mfaToken, 'administration');
  }

  async confirmMfaEnrollment(
    mfaToken: string,
    code: string,
    context: ClientContext,
  ): Promise<AuthenticatedOutcome & { backupCodes: string[] }> {
    const { userId, backupCodes } = await this.mfa.confirmEnrollment(mfaToken, code);
    await this.audit.log({
      action: AuditAction.MFA_ENABLED,
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      ipTruncated: context.ipTruncated,
    });
    const user = await this.findAuthUser(userId);
    const outcome = await this.openSession(user, true, context);
    return { ...outcome, backupCodes };
  }

  async verifyMfa(dto: MfaVerifyDto, context: ClientContext): Promise<AuthenticatedOutcome> {
    if (Boolean(dto.code) === Boolean(dto.backupCode)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Les données envoyées sont invalides.',
        [
          {
            field: 'code',
            messages: ['saisissez soit un code à 6 chiffres, soit un code de secours'],
          },
        ],
      );
    }
    const result = await this.mfa.verifyChallenge(dto.mfaToken, dto);
    if (!result.ok) {
      await this.attempts.recordFailure(`mfa:${result.userId}`, context.ip);
      await this.audit.log({
        action: AuditAction.MFA_FAILED,
        targetType: 'user',
        targetId: result.userId,
        ipTruncated: context.ipTruncated,
      });
      throw result.exhausted ? tooManyCodes() : mfaError();
    }
    await this.attempts.reset(`mfa:${result.userId}`, context.ip);
    if (result.usedBackupCode) {
      await this.audit.log({
        action: AuditAction.MFA_BACKUP_CODE_USED,
        actorId: result.userId,
        targetType: 'user',
        targetId: result.userId,
        ipTruncated: context.ipTruncated,
      });
    }
    const user = await this.findAuthUser(result.userId);
    return this.openSession(user, true, context);
  }

  async regenerateBackupCodes(user: AuthenticatedUser, code: string): Promise<string[]> {
    const backupCodes = await this.mfa.regenerateBackupCodes(user.id, code);
    if (!backupCodes) throw mfaError();
    await this.audit.log({
      action: AuditAction.MFA_BACKUP_CODES_REGENERATED,
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
    });
    return backupCodes;
  }

  async refresh(
    refreshToken: string | undefined,
    context: ClientContext,
  ): Promise<AuthenticatedOutcome> {
    if (!refreshToken) throw sessionExpired();
    const session = await this.sessions.rotate(refreshToken, context);
    const user = await this.findAuthUser(session.userId);
    return { session, body: this.authenticatedBody(user, session) };
  }

  /** Déconnexion de l'appareil courant (via le cookie, et/ou la session du jeton d'accès). */
  async logout(refreshToken: string | undefined, context: ClientContext): Promise<void> {
    if (!refreshToken) return;
    const sessionId = await this.sessions.findSessionIdByRefreshToken(refreshToken);
    if (!sessionId) return;
    await this.sessions.revoke(sessionId, 'logout');
    await this.audit.log({
      action: AuditAction.LOGOUT,
      targetType: 'session',
      targetId: sessionId,
      ipTruncated: context.ipTruncated,
    });
  }

  async logoutAll(user: AuthenticatedUser, context: ClientContext): Promise<void> {
    const count = await this.sessions.revokeAllForUser(user.id, 'logout_all');
    await this.audit.log({
      action: AuditAction.LOGOUT_ALL,
      actorId: user.id,
      targetType: 'user',
      targetId: user.id,
      metadata: { sessions: count },
      ipTruncated: context.ipTruncated,
    });
  }

  // ---------------------------------------------------------------------------
  // Mot de passe
  // ---------------------------------------------------------------------------

  async forgotPassword(email: string, context: ClientContext): Promise<{ message: string }> {
    return withMinDuration(ANTI_ENUMERATION_MIN_MS, async () => {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, firstName: true, status: true },
      });
      if (
        user &&
        user.status === 'active' &&
        (await this.userTokens.allowEmailSend('password-reset', email))
      ) {
        const token = await this.userTokens.issue(user.id, 'password_reset', PASSWORD_RESET_TTL_MS);
        await this.mail.send('password-reset', email, {
          firstName: user.firstName,
          link: this.link('/reinitialiser', token),
          expiresInMinutes: PASSWORD_RESET_TTL_MS / 60_000,
        });
        await this.audit.log({
          action: AuditAction.PASSWORD_RESET_REQUESTED,
          targetType: 'user',
          targetId: user.id,
          ipTruncated: context.ipTruncated,
        });
      }
      return { message: MESSAGES.resetSent };
    });
  }

  async resetPassword(dto: ResetPasswordDto, context: ClientContext): Promise<{ message: string }> {
    const { userId } = await this.userTokens.consume(dto.token, 'password_reset');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, status: true, emailVerifiedAt: true },
    });
    this.passwords.assertPolicy(dto.password, user);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.passwords.hash(dto.password),
        passwordChangedAt: new Date(),
        // Le lien reçu par e-mail prouve aussi la possession de l'adresse.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    await this.sessions.revokeAllForUser(userId, 'password_reset');
    await this.attempts.reset(user.email, context.ip);
    await this.mail.send('password-changed', user.email, {
      firstName: user.firstName,
      resetLink: this.link('/mot-de-passe-oublie'),
    });
    await this.audit.log({
      action: AuditAction.PASSWORD_RESET,
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      ipTruncated: context.ipTruncated,
    });
    return { message: MESSAGES.passwordReset };
  }

  /** Changement de mot de passe : les autres sessions sont révoquées, la session courante est conservée. */
  async changePassword(
    current: AuthenticatedUser,
    dto: ChangePasswordDto,
    context: ClientContext,
  ): Promise<{ message: string }> {
    const user = await this.verifyCurrentPassword(current.id, dto.currentPassword, context);
    this.passwords.assertPolicy(dto.newPassword, user, 'newPassword');
    await this.prisma.user.update({
      where: { id: current.id },
      data: {
        passwordHash: await this.passwords.hash(dto.newPassword),
        passwordChangedAt: new Date(),
      },
    });
    await this.sessions.revokeAllForUser(current.id, 'password_changed', current.sessionId);
    await this.mail.send('password-changed', user.email, {
      firstName: user.firstName,
      resetLink: this.link('/mot-de-passe-oublie'),
    });
    await this.audit.log({
      action: AuditAction.PASSWORD_CHANGED,
      actorId: current.id,
      targetType: 'user',
      targetId: current.id,
      ipTruncated: context.ipTruncated,
    });
    return { message: MESSAGES.passwordChanged };
  }

  /**
   * Re-saisie du mot de passe pour une action sensible, protégée par le même verrouillage
   * progressif que la connexion.
   */
  async verifyCurrentPassword(
    userId: string,
    password: string,
    context: ClientContext,
  ): Promise<{ email: string; firstName: string | null; lastName: string | null }> {
    const subject = `user:${userId}`;
    await this.attempts.assertAllowed(subject, context.ip);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, passwordHash: true },
    });
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      await this.attempts.recordFailure(subject, context.ip);
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.INVALID_PASSWORD,
        'Le mot de passe actuel est incorrect.',
      );
    }
    await this.attempts.reset(subject, context.ip);
    return { email: user.email, firstName: user.firstName, lastName: user.lastName };
  }

  // ---------------------------------------------------------------------------
  // Changement d'adresse e-mail
  // ---------------------------------------------------------------------------

  async requestEmailChange(
    current: AuthenticatedUser,
    dto: ChangeEmailDto,
    context: ClientContext,
  ): Promise<{ message: string }> {
    const user = await this.verifyCurrentPassword(current.id, dto.currentPassword, context);
    if (dto.newEmail === user.email.toLowerCase()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Les données envoyées sont invalides.',
        [{ field: 'newEmail', messages: ['doit être différente de votre adresse actuelle'] }],
      );
    }
    // Pas d'indication si l'adresse est déjà prise (anti-énumération) : la vérification
    // d'unicité a lieu à la confirmation.
    if (await this.userTokens.allowEmailSend('email-change', current.id)) {
      const token = await this.userTokens.issue(
        current.id,
        'email_change',
        EMAIL_CHANGE_TTL_MS,
        dto.newEmail,
      );
      await this.mail.send('email-change-confirm', dto.newEmail, {
        link: this.link('/confirmer-email', token),
        expiresInMinutes: EMAIL_CHANGE_TTL_MS / 60_000,
      });
      await this.mail.send('email-change-notice', user.email, { firstName: user.firstName });
      await this.audit.log({
        action: AuditAction.EMAIL_CHANGE_REQUESTED,
        actorId: current.id,
        targetType: 'user',
        targetId: current.id,
        ipTruncated: context.ipTruncated,
      });
    }
    return { message: MESSAGES.emailChangeSent };
  }

  async confirmEmailChange(token: string, context: ClientContext): Promise<{ message: string }> {
    const { userId, newEmail } = await this.userTokens.consume(token, 'email_change');
    if (!newEmail) throw new AppException(400, ErrorCode.INVALID_TOKEN, 'Ce lien est invalide.');
    try {
      await this.prisma.user.update({
        where: { id: userId, status: 'active' },
        data: { email: newEmail, emailVerifiedAt: new Date() },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.CONFLICT,
          'Cette adresse e-mail ne peut pas être utilisée. Merci d’en choisir une autre.',
        );
      }
      throw error;
    }
    await this.sessions.revokeAllForUser(userId, 'email_changed');
    await this.audit.log({
      action: AuditAction.EMAIL_CHANGED,
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      ipTruncated: context.ipTruncated,
    });
    return { message: MESSAGES.emailChanged };
  }

  // ---------------------------------------------------------------------------
  // Outils internes
  // ---------------------------------------------------------------------------

  private async findAuthUser(userId: string): Promise<AuthUserRecord> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT });
  }

  private async openSession(
    user: AuthUserRecord,
    mfa: boolean,
    context: ClientContext,
  ): Promise<AuthenticatedOutcome> {
    const session = await this.sessions.create(user, { mfa, context });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      action: AuditAction.LOGIN_SUCCEEDED,
      actorId: user.id,
      targetType: 'session',
      targetId: session.sessionId,
      metadata: { mfa },
      ipTruncated: context.ipTruncated,
    });
    if (user.role === 'admin') {
      await this.mail.send('admin-login-alert', user.email, {
        at: formatParisDate(new Date()),
        ipTruncated: context.ipTruncated,
        userAgent: context.userAgent,
      });
    }
    return { session, body: this.authenticatedBody(user, session) };
  }

  private authenticatedBody(
    user: AuthUserRecord,
    session: IssuedSession,
  ): AuthenticatedResponseDto {
    const { accessToken, expiresIn } = this.accessTokens.sign(session);
    return { status: 'authenticated', accessToken, expiresIn, user: this.toAuthUser(user) };
  }

  private toAuthUser(user: AuthUserRecord): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      mfaEnabled: user.totpEnabledAt !== null,
    };
  }
}
