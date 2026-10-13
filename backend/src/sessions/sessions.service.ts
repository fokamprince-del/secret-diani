import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type Redis from 'ioredis';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { MAX_ACCESS_TTL_MS, SESSION_POLICIES } from '../auth/auth.constants';
import type { ClientContext } from '../common/auth/client-context';
import { randomToken, sha256Hex } from '../common/crypto/hash';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

export interface IssuedSession {
  sessionId: string;
  userId: string;
  role: UserRole;
  mfa: boolean;
  /** Refresh token en clair : transmis une seule fois, dans le cookie HttpOnly. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface SessionView {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipTruncated: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export type RevocationReason =
  | 'logout'
  | 'logout_all'
  | 'refresh_reuse'
  | 'password_changed'
  | 'password_reset'
  | 'email_changed'
  | 'user_revoked'
  | 'account_deleted';

const revokedKey = (sessionId: string): string => `auth:revoked-session:${sessionId}`;

export function sessionExpired(): AppException {
  return new AppException(
    HttpStatus.UNAUTHORIZED,
    ErrorCode.SESSION_EXPIRED,
    'Votre session a expiré. Merci de vous reconnecter.',
  );
}

/**
 * Sessions et refresh tokens (voir docs/DECISIONS.md, D-025).
 * Une session = une famille de rotation. Chaque refresh token ne sert qu'une fois ;
 * la présentation d'un jeton déjà utilisé révoque toute la famille (vol présumé).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async create(
    user: { id: string; role: UserRole },
    options: { mfa: boolean; context: ClientContext },
  ): Promise<IssuedSession> {
    const policy = SESSION_POLICIES[user.role];
    const now = Date.now();
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(now + policy.refreshTtlMs);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        mfa: options.mfa,
        userAgent: options.context.userAgent,
        ipTruncated: options.context.ipTruncated,
        expiresAt: new Date(now + policy.sessionMaxMs),
        refreshTokens: {
          create: { tokenHash: sha256Hex(refreshToken), expiresAt: refreshExpiresAt },
        },
      },
      select: { id: true },
    });
    return {
      sessionId: session.id,
      userId: user.id,
      role: user.role,
      mfa: options.mfa,
      refreshToken,
      refreshExpiresAt,
    };
  }

  /** Échange un refresh token contre un nouveau (rotation). Atomique : un jeton ne sert qu'une fois. */
  async rotate(rawToken: string, context: ClientContext): Promise<IssuedSession> {
    const tokenHash = sha256Hex(rawToken);
    const now = new Date();

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    if (claimed.count === 0) {
      const existing = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { usedAt: true, session: { select: { id: true, userId: true, revokedAt: true } } },
      });
      if (existing?.usedAt && !existing.session.revokedAt) {
        await this.revoke(existing.session.id, 'refresh_reuse');
        await this.audit.log({
          action: AuditAction.REFRESH_REUSE_DETECTED,
          actorId: existing.session.userId,
          targetType: 'session',
          targetId: existing.session.id,
          ipTruncated: context.ipTruncated,
        });
      }
      throw sessionExpired();
    }

    const token = await this.prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash },
      select: {
        session: {
          select: {
            id: true,
            mfa: true,
            revokedAt: true,
            expiresAt: true,
            user: { select: { id: true, role: true, status: true } },
          },
        },
      },
    });
    const { session } = token;
    const { user } = session;
    if (
      session.revokedAt ||
      session.expiresAt <= now ||
      user.status !== 'active' ||
      (user.role === 'admin' && !session.mfa)
    ) {
      throw sessionExpired();
    }

    const policy = SESSION_POLICIES[user.role];
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(
      Math.min(now.getTime() + policy.refreshTtlMs, session.expiresAt.getTime()),
    );
    await this.prisma.$transaction([
      this.prisma.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: sha256Hex(refreshToken),
          expiresAt: refreshExpiresAt,
        },
      }),
      this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: now, ipTruncated: context.ipTruncated, userAgent: context.userAgent },
      }),
    ]);

    return {
      sessionId: session.id,
      userId: user.id,
      role: user.role,
      mfa: session.mfa,
      refreshToken,
      refreshExpiresAt,
    };
  }

  /** Session à laquelle appartient un refresh token (déconnexion), qu'il soit utilisé ou non. */
  async findSessionIdByRefreshToken(rawToken: string): Promise<string | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
      select: { sessionId: true },
    });
    return token?.sessionId ?? null;
  }

  async revoke(sessionId: string, reason: RevocationReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.markRevoked([sessionId]);
  }

  /** Révoque toutes les sessions actives d'un utilisateur (sauf, éventuellement, la session courante). */
  async revokeAllForUser(
    userId: string,
    reason: RevocationReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    const ids = sessions.map((session) => session.id);
    if (ids.length === 0) return 0;
    await this.prisma.session.updateMany({
      where: { id: { in: ids }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.markRevoked(ids);
    return ids.length;
  }

  /**
   * Les jetons d'accès (JWT) restent techniquement valides jusqu'à leur expiration :
   * la garde consulte cette liste Redis pour refuser immédiatement ceux d'une session révoquée.
   */
  private async markRevoked(sessionIds: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const id of sessionIds) pipeline.set(revokedKey(id), '1', 'PX', MAX_ACCESS_TTL_MS);
    await pipeline.exec();
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(revokedKey(sessionId))) === 1;
  }

  async listForUser(userId: string, currentSessionId: string): Promise<SessionView[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        userAgent: true,
        ipTruncated: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  }

  /** Révoque une session de l'utilisateur. 404 si elle ne lui appartient pas (anti-IDOR). */
  async revokeOwn(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
      select: { id: true },
    });
    if (!session) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Session introuvable.');
    }
    await this.revoke(session.id, 'user_revoked');
  }
}
