import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DAY = 24 * 60 * 60 * 1000;

/** Durées de conservation (registre des traitements : docs/RGPD.md). */
export const RETENTION = {
  /** Refresh tokens expirés ou utilisés. */
  refreshTokensDays: 7,
  /** Sessions expirées ou révoquées (historique « appareils connectés »). */
  sessionsDays: 30,
  /** Jetons envoyés par e-mail, expirés ou utilisés. */
  userTokensDays: 7,
  /** Comptes jamais confirmés. */
  unverifiedAccountsDays: 30,
  /** Journal d'audit (aligné sur le déclencheur de la base). */
  auditLogsDays: 365,
} as const;

export type PurgeReport = Record<keyof typeof RETENTION, number>;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async purge(now: Date = new Date()): Promise<PurgeReport> {
    const before = (days: number) => new Date(now.getTime() - days * DAY);

    const refreshTokens = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: before(RETENTION.refreshTokensDays) } },
          { usedAt: { lt: before(RETENTION.refreshTokensDays) } },
        ],
      },
    });
    const sessions = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: before(RETENTION.sessionsDays) } },
          { revokedAt: { lt: before(RETENTION.sessionsDays) } },
        ],
      },
    });
    const userTokens = await this.prisma.userToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: before(RETENTION.userTokensDays) } },
          { usedAt: { lt: before(RETENTION.userTokensDays) } },
        ],
      },
    });
    const unverifiedAccounts = await this.prisma.user.deleteMany({
      where: {
        role: 'client',
        status: 'active',
        emailVerifiedAt: null,
        createdAt: { lt: before(RETENTION.unverifiedAccountsDays) },
      },
    });
    // Le déclencheur `audit_logs_immutable` n'autorise que ces suppressions-là.
    const auditLogs = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: before(RETENTION.auditLogsDays) } },
    });

    const report: PurgeReport = {
      refreshTokensDays: refreshTokens.count,
      sessionsDays: sessions.count,
      userTokensDays: userTokens.count,
      unverifiedAccountsDays: unverifiedAccounts.count,
      auditLogsDays: auditLogs.count,
    };
    this.logger.log({ report }, 'Purge des données expirées terminée');
    return report;
  }
}
