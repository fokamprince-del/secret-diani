import { HttpStatus, Injectable } from '@nestjs/common';
import type { AccessSource, UserRole } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';
import { fieldError, notFound } from '../../content/common/content.helpers';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { grantsAccess } from '../domain/courses-domain';

export interface Viewer {
  id: string;
  role: UserRole;
}

/** Packs dont l'accès est actif maintenant (ni révoqué, ni expiré). */
function activeWhere(userId: string, now: Date) {
  return {
    userId,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

/**
 * Droits d'accès aux formations. Un pack inclut tous les packs de rang inférieur
 * (Premium ⊇ Intermédiaire ⊇ Essentiel). Les administratrices voient tout (aperçu).
 * Les accès achetés ne sont créés qu'au paiement confirmé (OrdersService.markPaid).
 */
@Injectable()
export class AccessService {
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: AppConfigService,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL').replace(/\/$/, '');
  }

  /** Rangs des packs détenus ; Infinity pour une administratrice. */
  async ranks(viewer: Viewer, now = new Date()): Promise<number[]> {
    if (viewer.role === 'admin') return [Number.POSITIVE_INFINITY];
    const accesses = await this.prisma.courseAccess.findMany({
      where: activeWhere(viewer.id, now),
      select: { pack: { select: { rank: true } } },
    });
    return accesses.map((access) => access.pack.rank);
  }

  async canAccess(viewer: Viewer, requiredRank: number): Promise<boolean> {
    return grantsAccess(await this.ranks(viewer), requiredRank);
  }

  /** Refus explicite et utile : le frontend propose le pack à acheter. */
  async require(viewer: Viewer, pack: { slug: string; name: string; rank: number }): Promise<void> {
    if (await this.canAccess(viewer, pack.rank)) return;
    throw new AppException(
      HttpStatus.FORBIDDEN,
      ErrorCode.COURSE_ACCESS_REQUIRED,
      `Cette formation fait partie du pack ${pack.name}. Choisissez ce pack (ou un pack supérieur) pour y accéder.`,
      [{ field: 'pack', messages: [pack.slug] }],
    );
  }

  // --- Administration ------------------------------------------------------------------------

  /** Accès offert ou accordé par l'administration (un seul accès actif par pack). */
  async grant(
    input: {
      userId: string;
      packId: string;
      source: Exclude<AccessSource, 'purchase'>;
      expiresAt?: Date | null;
      note?: string | null;
    },
    actorId: string,
  ): Promise<{ id: string }> {
    const [user, pack] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: input.userId, deletedAt: null, status: { not: 'deleted' } },
        select: { email: true, firstName: true },
      }),
      this.prisma.coursePack.findUnique({ where: { id: input.packId }, select: { name: true } }),
    ]);
    if (!user) throw fieldError('userId', 'compte introuvable');
    if (!pack) throw fieldError('packId', 'pack introuvable');
    if (input.expiresAt && input.expiresAt <= new Date())
      throw fieldError('expiresAt', 'doit être dans le futur');
    const existing = await this.prisma.courseAccess.findFirst({
      where: { userId: input.userId, packId: input.packId, revokedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.ALREADY_ENROLLED,
        'Cette cliente a déjà accès à ce pack.',
      );
    }
    const access = await this.prisma.courseAccess.create({
      data: {
        userId: input.userId,
        packId: input.packId,
        source: input.source,
        grantedById: actorId,
        expiresAt: input.expiresAt ?? null,
        note: input.note ?? null,
      },
      select: { id: true },
    });
    await this.audit.log({
      action: AuditAction.COURSE_ACCESS_GRANTED,
      actorId,
      targetType: 'user',
      targetId: input.userId,
      metadata: { packId: input.packId, source: input.source },
    });
    await this.mail.send('course-access-granted', user.email, {
      firstName: user.firstName,
      packName: pack.name,
      link: `${this.siteUrl}/espace-membre`,
    });
    return access;
  }

  async revoke(accessId: string, note: string, actorId: string): Promise<void> {
    const revoked = await this.prisma.courseAccess.updateMany({
      where: { id: accessId, revokedAt: null },
      data: { revokedAt: new Date(), note },
    });
    if (revoked.count === 0) throw notFound('Accès introuvable ou déjà retiré.');
    await this.audit.log({
      action: AuditAction.COURSE_ACCESS_REVOKED,
      actorId,
      targetType: 'course_access',
      targetId: accessId,
    });
  }

  listForUser(userId: string) {
    return this.prisma.courseAccess.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        source: true,
        orderId: true,
        expiresAt: true,
        revokedAt: true,
        note: true,
        createdAt: true,
        pack: { select: { id: true, slug: true, name: true, rank: true } },
      },
    });
  }
}
