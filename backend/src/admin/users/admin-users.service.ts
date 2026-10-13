import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, UserRole, UserStatus } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { LoginAttemptsService } from '../../auth/login-attempts.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type CursorPage, toCursorPage } from '../../common/pagination/cursor';
import { notFound } from '../../content/common/content.helpers';
import { MailService } from '../../mail/mail.service';
import type { MailTemplateData } from '../../mail/templates/template-data';
import { PrismaService } from '../../prisma/prisma.service';
import { RgpdService } from '../../rgpd/rgpd.service';
import { SessionsService } from '../../sessions/sessions.service';

const LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  totpEnabledAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

export interface AdminUserView {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface AdminUserDetail extends AdminUserView {
  phone: string | null;
  lockedAt: Date | null;
  marketingConsent: boolean;
  stats: { orders: number; paidOrders: number; activeSessions: number; activeAccesses: number };
  recentOrders: {
    id: string;
    number: number;
    status: string;
    totalCents: number;
    createdAt: Date;
  }[];
}

export interface AdminUserQuery {
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  cursor?: string;
  limit?: number;
}

type SecurityChange = MailTemplateData['account-security-changed']['change'];

function toView(row: UserRow): AdminUserView {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerifiedAt !== null,
    mfaEnabled: row.totpEnabledAt !== null,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

function conflict(message: string): AppException {
  return new AppException(HttpStatus.CONFLICT, ErrorCode.INVALID_STATUS_TRANSITION, message);
}

/**
 * Gestion des comptes par l'administration : recherche, fiche, suspension et réactivation,
 * réinitialisation de la double authentification, déconnexion de tous les appareils, export
 * des données (droit d'accès exercé par e-mail). Une administratrice n'agit jamais sur son
 * propre compte par ce biais (espace personnel), ni sur un compte supprimé. Le rôle ne se
 * change pas ici : les administrateurs se créent en ligne de commande (D-084).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly attempts: LoginAttemptsService,
    private readonly rgpd: RgpdService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminUserQuery): Promise<CursorPage<AdminUserView>> {
    const limit = query.limit ?? 20;
    const q = query.q?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        // Comptes supprimés (anonymisés) : seulement sur demande explicite.
        status: query.status ?? { not: 'deleted' },
        ...(query.role ? { role: query.role } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: LIST_SELECT,
    });
    const page = toCursorPage(rows, limit);
    return { items: page.items.map(toView), nextCursor: page.nextCursor };
  }

  async get(id: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { ...LIST_SELECT, phone: true, lockedAt: true, marketingConsentAt: true },
    });
    if (!user) throw notFound('Compte introuvable.');
    const now = new Date();
    const [orders, paidOrders, activeSessions, activeAccesses, recentOrders] = await Promise.all([
      this.prisma.order.count({ where: { userId: id } }),
      this.prisma.order.count({ where: { userId: id, paidAt: { not: null } } }),
      this.prisma.session.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.courseAccess.count({
        where: {
          userId: id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      this.prisma.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, number: true, status: true, totalCents: true, createdAt: true },
      }),
    ]);
    return {
      ...toView(user),
      phone: user.phone,
      lockedAt: user.lockedAt,
      marketingConsent: user.marketingConsentAt !== null,
      stats: { orders, paidOrders, activeSessions, activeAccesses },
      recentOrders,
    };
  }

  /** Suspension : connexion refusée, toutes les sessions révoquées immédiatement. */
  async lock(id: string, actorId: string): Promise<AdminUserDetail> {
    const user = await this.target(id, actorId);
    if (user.status === 'locked') throw conflict('Ce compte est déjà suspendu.');
    const updated = await this.prisma.user.updateMany({
      where: { id, status: 'active' },
      data: { status: 'locked', lockedAt: new Date() },
    });
    if (updated.count === 0) throw conflict('Ce compte a changé entre-temps : rechargez la page.');
    const revoked = await this.sessions.revokeAllForUser(id, 'admin_locked');
    await this.done(user, 'locked', AuditAction.USER_LOCKED, actorId, { sessions: revoked });
    return this.get(id);
  }

  async unlock(id: string, actorId: string): Promise<AdminUserDetail> {
    const user = await this.target(id, actorId);
    if (user.status !== 'locked') throw conflict('Ce compte n’est pas suspendu.');
    await this.prisma.user.updateMany({
      where: { id, status: 'locked' },
      data: { status: 'active', lockedAt: null },
    });
    // Le verrou anti-force brute posé sur l'adresse est levé du même geste.
    await this.attempts.resetSubject(user.email);
    await this.done(user, 'unlocked', AuditAction.USER_UNLOCKED, actorId);
    return this.get(id);
  }

  /**
   * Téléphone perdu : secret TOTP et codes de secours effacés, sessions révoquées. Pour un
   * administrateur, l'enrôlement est redemandé à la connexion suivante.
   */
  async resetMfa(id: string, actorId: string): Promise<AdminUserDetail> {
    const user = await this.target(id, actorId);
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { totpSecretEnc: true },
    });
    if (!current.totpSecretEnc) throw conflict('La double authentification n’est pas activée.');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
      }),
      this.prisma.mfaBackupCode.deleteMany({ where: { userId: id } }),
    ]);
    const revoked = await this.sessions.revokeAllForUser(id, 'mfa_reset');
    await this.done(user, 'mfa_reset', AuditAction.USER_MFA_RESET, actorId, { sessions: revoked });
    return this.get(id);
  }

  async revokeSessions(id: string, actorId: string): Promise<{ revoked: number }> {
    const user = await this.target(id, actorId);
    const revoked = await this.sessions.revokeAllForUser(id, 'admin_revoked');
    await this.done(user, 'sessions_revoked', AuditAction.USER_SESSIONS_REVOKED, actorId, {
      sessions: revoked,
    });
    return { revoked };
  }

  /** Export des données d'un compte (demande d'accès reçue par e-mail ou courrier). */
  async exportData(id: string, actorId: string): Promise<Record<string, unknown>> {
    await this.target(id, actorId, { allowSelf: true });
    const data = await this.rgpd.exportData(id);
    await this.audit.log({
      action: AuditAction.USER_DATA_EXPORTED,
      actorId,
      targetType: 'user',
      targetId: id,
    });
    return data;
  }

  private async target(
    id: string,
    actorId: string,
    options: { allowSelf?: boolean } = {},
  ): Promise<{ id: string; email: string; firstName: string | null; status: UserStatus }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, status: true },
    });
    if (!user) throw notFound('Compte introuvable.');
    if (user.status === 'deleted') throw conflict('Ce compte est supprimé.');
    if (id === actorId && !options.allowSelf) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'Pour votre propre compte, passez par votre espace personnel (sécurité).',
      );
    }
    return user;
  }

  private async done(
    user: { id: string; email: string; firstName: string | null },
    change: SecurityChange,
    action: AuditAction,
    actorId: string,
    metadata?: Record<string, number>,
  ): Promise<void> {
    await this.audit.log({ action, actorId, targetType: 'user', targetId: user.id, metadata });
    await this.mail.send('account-security-changed', user.email, {
      firstName: user.firstName,
      change,
    });
  }
}
