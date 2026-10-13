import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toCursorPage, type CursorPage } from '../common/pagination/cursor';
import type { AuditAction } from './audit-actions';

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  targetType?: string;
  targetId?: string | null;
  /** Données contextuelles SANS donnée personnelle (ni e-mail, ni nom, ni IP complète). */
  metadata?: Record<string, string | number | boolean | null>;
  ipTruncated?: string | null;
}

export interface AuditLogView {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue;
  ipTruncated: string | null;
  createdAt: Date;
}

export interface AuditQuery {
  cursor?: string;
  limit: number;
  action?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
}

/** Journal d'audit immuable (la base interdit UPDATE et DELETE, voir migration). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Écrit une entrée. Un échec d'audit est journalisé mais n'interrompt pas l'action métier. */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      await (tx ?? this.prisma).auditLog.create({
        data: {
          action: entry.action,
          actorId: entry.actorId ?? null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: entry.metadata ?? Prisma.JsonNull,
          ipTruncated: entry.ipTruncated ?? null,
        },
      });
    } catch (error) {
      if (tx) throw error;
      this.logger.error(
        { err: error, action: entry.action },
        'Échec d’écriture du journal d’audit',
      );
    }
  }

  async list(query: AuditQuery): Promise<CursorPage<AuditLogView>> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.action ? { action: query.action } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lt: query.to } : {}),
              },
            }
          : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: {
        id: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        ipTruncated: true,
        createdAt: true,
      },
    });
    return toCursorPage(rows, query.limit);
  }
}
