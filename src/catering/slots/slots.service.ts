import { HttpStatus, Injectable } from '@nestjs/common';
import type { CateringFulfilment } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';
import { fieldError, notFound } from '../../content/common/content.helpers';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdminSlotDto,
  CateringSlotDto,
  CreateSlotDto,
  UpdateSlotDto,
} from '../dto/requests.dto';

const SLOT_SELECT = {
  id: true,
  fulfilment: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  active: true,
  _count: { select: { requests: { where: { status: { not: 'cancelled' as const } } } } },
};

/**
 * Créneaux de retrait et de livraison du parcours avancé (CATERING_ONLINE_ORDERING).
 * L'administration peut les préparer à tout moment ; le public ne les voit que si le
 * parcours est ouvert.
 */
@Injectable()
export class CateringSlotsService {
  private readonly onlineOrdering: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: AppConfigService,
  ) {
    this.onlineOrdering = config.get('CATERING_ONLINE_ORDERING');
  }

  async listAvailable(fulfilment?: CateringFulfilment): Promise<CateringSlotDto[]> {
    if (!this.onlineOrdering) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FEATURE_DISABLED,
        'La commande en ligne n’est pas encore ouverte : envoyez-nous une demande personnalisée.',
      );
    }
    const rows = await this.prisma.cateringSlot.findMany({
      where: { active: true, startsAt: { gt: new Date() }, ...(fulfilment ? { fulfilment } : {}) },
      orderBy: { startsAt: 'asc' },
      take: 200,
      select: SLOT_SELECT,
    });
    return rows
      .map(({ _count, capacity, active: _active, ...slot }) => ({
        ...slot,
        remaining: capacity - _count.requests,
      }))
      .filter((slot) => slot.remaining > 0);
  }

  async listAdmin(): Promise<AdminSlotDto[]> {
    const rows = await this.prisma.cateringSlot.findMany({
      where: { endsAt: { gt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
      orderBy: { startsAt: 'asc' },
      take: 500,
      select: SLOT_SELECT,
    });
    return rows.map((row) => this.toAdmin(row));
  }

  async create(dto: CreateSlotDto, actorId: string): Promise<AdminSlotDto> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw fieldError('endsAt', 'doit être après le début');
    const slot = await this.prisma.cateringSlot.create({
      data: { fulfilment: dto.fulfilment, startsAt, endsAt, capacity: dto.capacity },
      select: SLOT_SELECT,
    });
    await this.log(actorId, slot.id);
    return this.toAdmin(slot);
  }

  async update(id: string, dto: UpdateSlotDto, actorId: string): Promise<AdminSlotDto> {
    const current = await this.prisma.cateringSlot.findUnique({
      where: { id },
      select: SLOT_SELECT,
    });
    if (!current) throw notFound('Créneau introuvable.');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    if (endsAt <= startsAt) throw fieldError('endsAt', 'doit être après le début');
    if (dto.capacity !== undefined && dto.capacity < current._count.requests) {
      throw fieldError('capacity', `déjà ${current._count.requests} commande(s) sur ce créneau`);
    }
    const slot = await this.prisma.cateringSlot.update({
      where: { id },
      data: {
        ...(dto.fulfilment ? { fulfilment: dto.fulfilment } : {}),
        startsAt,
        endsAt,
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      select: SLOT_SELECT,
    });
    await this.log(actorId, id);
    return this.toAdmin(slot);
  }

  /** Un créneau qui porte des commandes se désactive, il ne se supprime pas. */
  async remove(id: string, actorId: string): Promise<void> {
    const used = await this.prisma.cateringRequest.count({ where: { slotId: id } });
    if (used > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Ce créneau porte des commandes : désactivez-le plutôt.',
      );
    }
    const deleted = await this.prisma.cateringSlot.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound('Créneau introuvable.');
    await this.log(actorId, id);
  }

  private toAdmin(row: {
    id: string;
    fulfilment: CateringFulfilment;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
    active: boolean;
    _count: { requests: number };
  }): AdminSlotDto {
    const { _count, ...slot } = row;
    return { ...slot, remaining: Math.max(slot.capacity - _count.requests, 0) };
  }

  private log(actorId: string, id: string): Promise<void> {
    return this.audit.log({
      action: AuditAction.CATERING_SLOT_CHANGED,
      actorId,
      targetType: 'catering_slot',
      targetId: id,
    });
  }
}
