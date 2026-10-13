import { Injectable } from '@nestjs/common';
import { addDays, parisToday } from '../../catering/domain/event-date';
import { PrismaService } from '../../prisma/prisma.service';

export interface DailySales {
  /** Jour civil à Paris (AAAA-MM-JJ). */
  day: string;
  orders: number;
  grossCents: number;
}

export interface LowStockLine {
  variantId: string;
  productName: string;
  label: string;
  sku: string;
  available: number;
  threshold: number;
}

export interface DashboardView {
  period: { days: number; from: string; to: string };
  sales: {
    orders: number;
    grossCents: number;
    refundedCents: number;
    netCents: number;
    shop: { orders: number; grossCents: number };
    courses: { orders: number; grossCents: number };
    daily: DailySales[];
  };
  todo: {
    ordersToShip: number;
    cateringPending: number;
    cateringUpcoming: number;
    contactMessagesNew: number;
    callRequestsPending: number;
  };
  customers: { newAccounts: number; verifiedNewAccounts: number; totalActive: number };
  courses: { newAccesses: number; activeAccesses: number };
  newsletter: { confirmed: number; newConfirmed: number };
  lowStock: LowStockLine[];
}

/**
 * Tableau de bord de l'administration : ventes de la période (jours civils de Paris), choses à
 * faire (commandes à expédier, demandes traiteur en attente, messages, appels), nouvelles
 * clientes, accès aux formations, newsletter et stocks bas. Des comptages indexés, aucune
 * donnée personnelle.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(days: number, now = new Date()): Promise<DashboardView> {
    const to = parisToday(now);
    const from = addDays(to, -(days - 1));
    const [start] = await this.prisma.$queryRaw<{ since: Date }[]>`
      SELECT (${from}::date::timestamp AT TIME ZONE 'Europe/Paris') AS since`;
    const since = start!.since;
    const paid = { paidAt: { gte: since } };
    const upcomingUntil = new Date(`${addDays(to, 14)}T00:00:00Z`);

    const [
      totals,
      byMethod,
      daily,
      ordersToShip,
      cateringPending,
      cateringUpcoming,
      contactMessagesNew,
      callRequestsPending,
      newAccounts,
      verifiedNewAccounts,
      totalActive,
      newAccesses,
      activeAccesses,
      confirmed,
      newConfirmed,
      lowStock,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: paid,
        _count: { _all: true },
        _sum: { totalCents: true, refundedCents: true },
      }),
      this.prisma.order.groupBy({
        by: ['shippingMethod'],
        where: paid,
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
      this.prisma.$queryRaw<{ day: string; orders: number; grossCents: number }[]>`
        SELECT to_char((paid_at AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS day,
               count(*)::int AS orders,
               coalesce(sum(total_cents), 0)::int AS "grossCents"
        FROM orders
        WHERE paid_at >= ${since}
        GROUP BY 1`,
      this.prisma.order.count({
        where: { status: { in: ['paid', 'preparing'] }, shippingMethod: { not: 'digital' } },
      }),
      this.prisma.cateringRequest.count({ where: { status: { in: ['new', 'contacted'] } } }),
      this.prisma.cateringRequest.count({
        where: {
          status: { in: ['deposit_received', 'confirmed'] },
          eventDate: { gte: new Date(`${to}T00:00:00Z`), lte: upcomingUntil },
        },
      }),
      this.prisma.contactMessage.count({ where: { status: 'new' } }),
      this.prisma.callRequest.count({ where: { status: 'requested' } }),
      this.prisma.user.count({
        where: { role: 'client', status: { not: 'deleted' }, createdAt: { gte: since } },
      }),
      this.prisma.user.count({
        where: {
          role: 'client',
          status: { not: 'deleted' },
          createdAt: { gte: since },
          emailVerifiedAt: { not: null },
        },
      }),
      this.prisma.user.count({ where: { role: 'client', status: 'active' } }),
      this.prisma.courseAccess.count({ where: { createdAt: { gte: since } } }),
      this.prisma.courseAccess.count({
        where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      }),
      this.prisma.newsletterSubscriber.count({ where: { status: 'confirmed' } }),
      this.prisma.newsletterSubscriber.count({
        where: { status: 'confirmed', confirmedAt: { gte: since } },
      }),
      this.prisma.$queryRaw<LowStockLine[]>`
        SELECT v.id AS "variantId", p.name AS "productName", v.label, v.sku,
               (s.on_hand - s.reserved) AS available, s.low_stock_threshold AS threshold
        FROM shop_stocks s
        JOIN shop_variants v ON v.id = s.variant_id
        JOIN shop_products p ON p.id = v.product_id
        WHERE v.active AND p.deleted_at IS NULL
          AND s.on_hand - s.reserved <= s.low_stock_threshold
        ORDER BY available ASC, p.name ASC
        LIMIT 50`,
    ]);

    const method = (digital: boolean) => {
      const rows = byMethod.filter((row) => (row.shippingMethod === 'digital') === digital);
      return {
        orders: rows.reduce((sum, row) => sum + row._count._all, 0),
        grossCents: rows.reduce((sum, row) => sum + (row._sum.totalCents ?? 0), 0),
      };
    };
    const grossCents = totals._sum.totalCents ?? 0;
    const refundedCents = totals._sum.refundedCents ?? 0;

    return {
      period: { days, from, to },
      sales: {
        orders: totals._count._all,
        grossCents,
        refundedCents,
        netCents: grossCents - refundedCents,
        shop: method(false),
        courses: method(true),
        daily: fillDays(from, days, daily),
      },
      todo: {
        ordersToShip,
        cateringPending,
        cateringUpcoming,
        contactMessagesNew,
        callRequestsPending,
      },
      customers: { newAccounts, verifiedNewAccounts, totalActive },
      courses: { newAccesses, activeAccesses },
      newsletter: { confirmed, newConfirmed },
      lowStock,
    };
  }
}

/** Série complète, un point par jour (zéro les jours sans vente) : graphique sans trou. */
export function fillDays(from: string, days: number, rows: DailySales[]): DailySales[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(from, index);
    return byDay.get(day) ?? { day, orders: 0, grossCents: 0 };
  });
}
