import { HttpStatus, Injectable } from '@nestjs/common';
import type { CallRequestStatus } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { notFound } from '../../content/common/content.helpers';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { packFeatures } from '../catalog/courses-catalog.service';
import type { CallRequestDto, PerksDto } from '../dto/courses.dto';

const CALL_SELECT = {
  id: true,
  status: true,
  message: true,
  scheduledAt: true,
  createdAt: true,
} as const;

/**
 * Avantages des packs : appels personnalisés (nombre inclus = somme des packs détenus, chaque
 * achat apportant ses propres appels) et avantages listés (fournisseurs offerts…).
 */
@Injectable()
export class PerksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async perks(userId: string, now = new Date()): Promise<PerksDto> {
    const [accesses, used] = await Promise.all([
      this.prisma.courseAccess.findMany({
        where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { pack: { select: { callsIncluded: true, features: true } } },
      }),
      this.prisma.callRequest.count({ where: { userId, status: { not: 'cancelled' } } }),
    ]);
    const included = accesses.reduce((sum, access) => sum + access.pack.callsIncluded, 0);
    return {
      callsIncluded: included,
      callsUsed: used,
      callsRemaining: Math.max(included - used, 0),
      features: [...new Set(accesses.flatMap((access) => packFeatures(access.pack.features)))],
    };
  }

  /** Demande d'appel : refusée s'il ne reste aucun appel ; l'administration est prévenue. */
  async requestCall(userId: string, message: string): Promise<CallRequestDto> {
    // Verrou du compte : deux demandes simultanées ne dépassent pas le nombre d'appels inclus.
    const request = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const { callsRemaining } = await this.perks(userId);
      if (callsRemaining <= 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.NO_CALLS_REMAINING,
          'Vous n’avez plus d’appel personnalisé disponible avec vos packs.',
        );
      }
      return tx.callRequest.create({ data: { userId, message }, select: CALL_SELECT });
    });
    const [user, perks] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      }),
      this.perks(userId),
    ]);
    await this.audit.log({
      action: AuditAction.CALL_REQUESTED,
      actorId: userId,
      targetType: 'call_request',
      targetId: request.id,
    });
    await this.mail.sendToAdmins('call-request-admin', {
      customerName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      email: user.email,
      message,
      remaining: perks.callsRemaining,
    });
    return request;
  }

  listMine(userId: string): Promise<CallRequestDto[]> {
    return this.prisma.callRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: CALL_SELECT,
    });
  }

  // --- Administration ------------------------------------------------------------------------

  listAdmin(status?: CallRequestStatus) {
    return this.prisma.callRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        ...CALL_SELECT,
        adminNote: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  async update(
    id: string,
    data: { status?: CallRequestStatus; scheduledAt?: Date | null; adminNote?: string | null },
    actorId: string,
  ) {
    const updated = await this.prisma.callRequest.updateMany({ where: { id }, data });
    if (updated.count === 0) throw notFound('Demande introuvable.');
    await this.audit.log({
      action: AuditAction.CALL_REQUEST_UPDATED,
      actorId,
      targetType: 'call_request',
      targetId: id,
    });
    return this.prisma.callRequest.findUniqueOrThrow({
      where: { id },
      select: {
        ...CALL_SELECT,
        adminNote: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }
}
