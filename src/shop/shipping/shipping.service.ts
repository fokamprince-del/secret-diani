import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { ContentCacheService } from '../../content/cache/content-cache.service';
import { fieldError, notFound } from '../../content/common/content.helpers';
import { PrismaService } from '../../prisma/prisma.service';
import type { RateRule } from '../domain/pricing';
import type {
  CreateShippingRateDto,
  ShippingRateDto,
  UpdateShippingRateDto,
} from '../dto/admin.dto';

const SELECT = {
  id: true,
  name: true,
  method: true,
  countries: true,
  minWeightGrams: true,
  maxWeightGrams: true,
  priceCents: true,
  freeFromCents: true,
  delay: true,
  position: true,
  active: true,
} satisfies Prisma.ShippingRateSelect;

/** Tarifs de livraison (zones, tranches de poids, gratuité) et retrait, gérés sans déploiement. */
@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
  ) {}

  /** Tarifs actifs, dans l'ordre défini par l'administration (lus à chaque calcul de panier). */
  activeRates(): Promise<RateRule[]> {
    return this.cache.getOrSet('shop:rates', () =>
      this.prisma.shippingRate.findMany({
        where: { active: true },
        orderBy: [{ position: 'asc' }, { priceCents: 'asc' }],
        select: {
          id: true,
          name: true,
          method: true,
          countries: true,
          minWeightGrams: true,
          maxWeightGrams: true,
          priceCents: true,
          freeFromCents: true,
          delay: true,
        },
      }),
    );
  }

  list(): Promise<ShippingRateDto[]> {
    return this.prisma.shippingRate.findMany({
      orderBy: [{ position: 'asc' }, { priceCents: 'asc' }],
      select: SELECT,
    });
  }

  async create(dto: CreateShippingRateDto, actorId: string): Promise<ShippingRateDto> {
    this.assertConsistent(
      dto.method,
      dto.countries ?? [],
      dto.minWeightGrams ?? 0,
      dto.maxWeightGrams,
    );
    const position = await this.prisma.shippingRate.count();
    const rate = await this.prisma.shippingRate.create({
      data: {
        name: dto.name,
        method: dto.method,
        countries: dto.method === 'pickup' ? [] : (dto.countries ?? []),
        minWeightGrams: dto.minWeightGrams ?? 0,
        maxWeightGrams: dto.maxWeightGrams ?? null,
        priceCents: dto.priceCents,
        freeFromCents: dto.freeFromCents ?? null,
        delay: dto.delay ?? null,
        active: dto.active ?? true,
        position,
      },
      select: SELECT,
    });
    await this.changed(actorId, rate.id);
    return rate;
  }

  async update(id: string, dto: UpdateShippingRateDto, actorId: string): Promise<ShippingRateDto> {
    const current = await this.prisma.shippingRate.findUnique({ where: { id }, select: SELECT });
    if (!current) throw notFound('Tarif introuvable.');
    const method = dto.method ?? current.method;
    const countries = dto.countries ?? current.countries;
    this.assertConsistent(
      method,
      countries,
      dto.minWeightGrams ?? current.minWeightGrams,
      dto.maxWeightGrams !== undefined ? dto.maxWeightGrams : current.maxWeightGrams,
    );
    const rate = await this.prisma.shippingRate.update({
      where: { id },
      data: { ...dto, countries: method === 'pickup' ? [] : countries },
      select: SELECT,
    });
    await this.changed(actorId, id);
    return rate;
  }

  /** Les commandes passées gardent le nom et le prix figés du tarif. */
  async remove(id: string, actorId: string): Promise<void> {
    const deleted = await this.prisma.shippingRate.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound('Tarif introuvable.');
    await this.changed(actorId, id);
  }

  async reorder(ids: string[], actorId: string): Promise<ShippingRateDto[]> {
    const existing = await this.prisma.shippingRate.count({ where: { id: { in: ids } } });
    if (existing !== ids.length) throw fieldError('ids', 'contient un tarif inconnu');
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.shippingRate.update({ where: { id }, data: { position } }),
      ),
    );
    await this.changed(actorId, null);
    return this.list();
  }

  private assertConsistent(
    method: string,
    countries: string[],
    minWeight: number,
    maxWeight: number | null | undefined,
  ): void {
    if (method === 'delivery' && countries.length === 0) {
      throw fieldError('countries', 'indiquez au moins un pays desservi');
    }
    if (maxWeight !== null && maxWeight !== undefined && maxWeight < minWeight) {
      throw fieldError('maxWeightGrams', 'doit être supérieur ou égal au poids minimal');
    }
  }

  private async changed(actorId: string, id: string | null): Promise<void> {
    await this.cache.changed(['shop']);
    await this.audit.log({
      action: AuditAction.SHOP_SHIPPING_CHANGED,
      actorId,
      targetType: 'shipping_rate',
      targetId: id,
    });
  }
}
