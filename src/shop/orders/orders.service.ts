import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type CursorPage, toCursorPage } from '../../common/pagination/cursor';
import { formatEuros } from '../../common/utils/money';
import { AppConfigService } from '../../config/app-config.service';
import { fieldError, notFound } from '../../content/common/content.helpers';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { toCsv } from '../domain/csv';
import {
  canTransition,
  nextAdminStatuses,
  ORDER_STATUS_LABELS,
  orderReference,
  parseOrderReference,
} from '../domain/order-status';
import type {
  AdminOrderDto,
  AdminOrderExportQueryDto,
  AdminOrderListDto,
  AdminOrderQueryDto,
  ChangeOrderStatusDto,
  OrderAddressDto,
  OrderDto,
  OrderSummaryDto,
} from '../dto/orders.dto';
import { InvoicesService, type StoredAddress } from '../invoices/invoices.service';
import { DOCUMENTS_QUEUE, type DocumentJobData } from '../shop.constants';
import { PICKUP_DETAILS, SELLER } from '../shop.settings';
import { StockLedger } from '../stock/stock-ledger';
import { StockService } from '../stock/stock.service';
import { OrderLinkService } from './order-link.service';

const ORDER_SELECT = {
  id: true,
  number: true,
  status: true,
  userId: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  shippingMethod: true,
  shippingRateName: true,
  shippingAddress: true,
  billingAddress: true,
  subtotalCents: true,
  shippingCents: true,
  totalCents: true,
  refundedCents: true,
  carrier: true,
  trackingNumber: true,
  customerNote: true,
  cartId: true,
  reservationExpiresAt: true,
  paidAt: true,
  shippedAt: true,
  deliveredAt: true,
  cancellationReason: true,
  createdAt: true,
  items: {
    orderBy: { position: 'asc' },
    select: {
      variantId: true,
      productName: true,
      variantLabel: true,
      sku: true,
      unitPriceCents: true,
      quantity: true,
    },
  },
  events: {
    orderBy: { createdAt: 'asc' },
    select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
  },
  invoice: { select: { number: true, pdfKey: true } },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

export type PaymentOutcome = 'paid' | 'already_paid' | 'stock_unavailable' | 'not_payable';

/** Le stock manque au moment de la confirmation : la transaction est annulée. */
class StockShortage extends Error {}

function transitionRefused(from: OrderStatus, to: OrderStatus): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.INVALID_STATUS_TRANSITION,
    `Impossible de passer une commande « ${ORDER_STATUS_LABELS[from]} » à « ${ORDER_STATUS_LABELS[to]} ».`,
  );
}

function dateBound(isoDate: string, endOfDay: boolean): Date {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

/**
 * Commandes boutique : confirmation du paiement (appelée par les webhooks, phase 6), étapes
 * logistiques, suivi par la cliente (compte ou lien signé),
 * liste, détail et export pour l'administration.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly ledger: StockLedger,
    private readonly invoices: InvoicesService,
    private readonly settings: SettingsService,
    private readonly links: OrderLinkService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @InjectQueue(DOCUMENTS_QUEUE) private readonly documents: Queue<DocumentJobData>,
    config: AppConfigService,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL').replace(/\/$/, '');
  }

  trackingLink(orderId: string): string {
    return `${this.siteUrl}/commande/suivi?token=${this.links.sign(orderId)}`;
  }

  // --- Paiement ------------------------------------------------------------------------------

  /**
   * Paiement confirmé par le prestataire (webhook signé) : stock vendu, commande payée, facture
   * émise, panier vidé des articles achetés, e-mail de confirmation. Idempotent. Si la
   * réservation a expiré et que le stock manque, rien n'est modifié : « stock_unavailable »
   * (le paiement doit être remboursé, phase 6).
   */
  async markPaid(
    orderId: string,
    payment: { provider: string; reference: string },
  ): Promise<PaymentOutcome> {
    const seller = await this.settings.get(SELLER);
    const now = new Date();
    let invoiceId: string | null = null;
    let outcome: PaymentOutcome;
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        // Verrou de la commande : deux webhooks simultanés ne la paient qu'une fois.
        const [locked] = await tx.$queryRaw<{ status: OrderStatus }[]>`
          SELECT status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
        if (!locked) return 'not_payable';
        if (locked.status !== 'pending_payment' && locked.status !== 'cancelled')
          return 'already_paid';

        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: ORDER_SELECT,
        });
        const lines = order.items.flatMap((item) =>
          item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : [],
        );
        if (!(await this.ledger.consume(tx, orderId, lines))) throw new StockShortage();

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'paid',
            paidAt: now,
            reservationExpiresAt: null,
            cancelledAt: null,
            cancellationReason: null,
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId,
            fromStatus: locked.status,
            toStatus: 'paid',
            note: `Paiement reçu (${payment.provider}, ${payment.reference})`,
          },
        });
        invoiceId = (await this.invoices.issue(tx, orderId, seller, now)).id;
        if (order.cartId) {
          await tx.shopCartItem.deleteMany({
            where: { cartId: order.cartId, variantId: { in: lines.map((line) => line.variantId) } },
          });
        }
        await this.audit.log(
          {
            action: AuditAction.SHOP_ORDER_PAID,
            targetType: 'order',
            targetId: orderId,
            metadata: { provider: payment.provider, totalCents: order.totalCents },
          },
          tx,
        );
        return 'paid';
      });
    } catch (error) {
      if (error instanceof StockShortage) {
        this.logger.warn(`Commande ${orderId} payée mais stock insuffisant : remboursement requis`);
        return 'stock_unavailable';
      }
      throw error;
    }

    if (outcome === 'paid') await this.afterPayment(orderId, invoiceId);
    return outcome;
  }

  // --- Administration ------------------------------------------------------------------------

  async changeStatus(
    id: string,
    dto: ChangeOrderStatusDto,
    actorId: string,
  ): Promise<AdminOrderDto> {
    const order = await this.prisma.order.findUnique({ where: { id }, select: ORDER_SELECT });
    if (!order) throw notFound('Commande introuvable.');
    if (!canTransition(order.status, dto.status)) throw transitionRefused(order.status, dto.status);
    if (dto.status === 'cancelled' && !dto.note)
      throw fieldError('note', 'indiquez le motif de l’annulation');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id, status: order.status },
        data: {
          status: dto.status,
          ...(dto.status === 'shipped'
            ? {
                shippedAt: now,
                carrier: dto.carrier ?? null,
                trackingNumber: dto.trackingNumber ?? null,
              }
            : {}),
          ...(dto.status === 'delivered' ? { deliveredAt: now } : {}),
          ...(dto.status === 'cancelled'
            ? { cancelledAt: now, cancellationReason: dto.note ?? null, reservationExpiresAt: null }
            : {}),
        },
      });
      if (updated.count === 0) throw transitionRefused(order.status, dto.status);
      if (dto.status === 'cancelled') await this.ledger.release(tx, id);
      await tx.orderEvent.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: dto.status,
          actorId,
          note: dto.note ?? null,
        },
      });
      await this.audit.log(
        {
          action: AuditAction.SHOP_ORDER_STATUS_CHANGED,
          actorId,
          targetType: 'order',
          targetId: id,
          metadata: { from: order.status, to: dto.status },
        },
        tx,
      );
    });

    if (dto.status === 'shipped') {
      await this.mail.send('order-shipped', order.email, {
        firstName: order.firstName,
        reference: orderReference(order.number),
        carrier: dto.carrier ?? null,
        trackingNumber: dto.trackingNumber ?? null,
        trackingLink: this.trackingLink(id),
      });
    }
    return this.getAdmin(id);
  }

  async listAdmin(query: AdminOrderQueryDto): Promise<AdminOrderListDto> {
    const limit = query.limit ?? 20;
    const where = this.adminWhere(query);
    if (query.cursor) where.id = { lt: query.cursor };
    if (query.q) {
      const number = parseOrderReference(query.q);
      if (number !== null) where.number = number;
      else if (query.q.includes('@')) where.email = query.q;
      else {
        where.OR = [
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
        ];
      }
    }
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        createdAt: true,
        email: true,
        firstName: true,
        lastName: true,
        userId: true,
        items: { select: { quantity: true } },
      },
    });
    const page = toCursorPage(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((row) => ({
        ...this.summary(row),
        email: row.email,
        customerName: `${row.firstName} ${row.lastName}`,
        hasAccount: row.userId !== null,
      })),
    };
  }

  async getAdmin(id: string): Promise<AdminOrderDto> {
    const row = await this.prisma.order.findUnique({ where: { id }, select: ORDER_SELECT });
    if (!row) throw notFound('Commande introuvable.');
    return {
      ...this.toOrder(row, true),
      email: row.email,
      customerName: `${row.firstName} ${row.lastName}`,
      phone: row.phone,
      userId: row.userId,
      billingAddress: row.billingAddress as unknown as OrderAddressDto,
      customerNote: row.customerNote,
      invoiceNumber: row.invoice?.number ?? null,
      cancellationReason: row.cancellationReason,
      nextStatuses: nextAdminStatuses(row.status),
    };
  }

  /** Export CSV (tableur) des commandes filtrées ; cellules protégées contre l'injection de formules. */
  async exportCsv(query: AdminOrderExportQueryDto, actorId: string): Promise<string> {
    const rows = await this.prisma.order.findMany({
      where: this.adminWhere(query),
      orderBy: { number: 'asc' },
      take: 20_000,
      select: {
        number: true,
        createdAt: true,
        paidAt: true,
        status: true,
        email: true,
        firstName: true,
        lastName: true,
        shippingRateName: true,
        subtotalCents: true,
        shippingCents: true,
        totalCents: true,
        refundedCents: true,
        trackingNumber: true,
        invoice: { select: { number: true } },
        items: {
          orderBy: { position: 'asc' },
          select: { quantity: true, productName: true, variantLabel: true },
        },
      },
    });
    await this.audit.log({
      action: AuditAction.SHOP_ORDERS_EXPORTED,
      actorId,
      metadata: { count: rows.length },
    });
    const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
    return toCsv(
      [
        'Référence',
        'Date',
        'Payée le',
        'Statut',
        'E-mail',
        'Nom',
        'Articles',
        'Livraison',
        'Sous-total (€)',
        'Frais de port (€)',
        'Total (€)',
        'Remboursé (€)',
        'Facture',
        'Suivi',
      ],
      rows.map((row) => [
        orderReference(row.number),
        row.createdAt.toISOString(),
        row.paidAt?.toISOString() ?? '',
        ORDER_STATUS_LABELS[row.status],
        row.email,
        `${row.firstName} ${row.lastName}`,
        row.items
          .map((item) => `${item.quantity} × ${item.productName} (${item.variantLabel})`)
          .join(' | '),
        row.shippingRateName,
        euros(row.subtotalCents),
        euros(row.shippingCents),
        euros(row.totalCents),
        euros(row.refundedCents),
        row.invoice?.number ?? '',
        row.trackingNumber ?? '',
      ]),
    );
  }

  // --- Cliente -------------------------------------------------------------------------------

  async listMine(
    userId: string,
    cursor: string | undefined,
    limit = 20,
  ): Promise<CursorPage<OrderSummaryDto>> {
    const rows = await this.prisma.order.findMany({
      where: { userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        createdAt: true,
        items: { select: { quantity: true } },
      },
    });
    const page = toCursorPage(rows, limit);
    return { nextCursor: page.nextCursor, items: page.items.map((row) => this.summary(row)) };
  }

  /** Commande d'une cliente : 404 si elle appartient à quelqu'un d'autre (anti-IDOR). */
  async getMine(userId: string, id: string): Promise<OrderDto> {
    const row = await this.prisma.order.findFirst({ where: { id, userId }, select: ORDER_SELECT });
    if (!row) throw notFound('Commande introuvable.');
    return this.toOrder(row);
  }

  async track(token: string): Promise<OrderDto> {
    const id = this.links.verify(token);
    const row = id
      ? await this.prisma.order.findUnique({ where: { id }, select: ORDER_SELECT })
      : null;
    if (!row) throw notFound('Commande introuvable.');
    return this.toOrder(row);
  }

  async mineInvoice(userId: string, id: string): Promise<{ url: string }> {
    const owned = await this.prisma.order.count({ where: { id, userId } });
    if (owned === 0) throw notFound('Commande introuvable.');
    return this.invoices.downloadUrl(id);
  }

  async trackedInvoice(token: string): Promise<{ url: string }> {
    const id = this.links.verify(token);
    if (!id) throw notFound('Commande introuvable.');
    return this.invoices.downloadUrl(id);
  }

  // --- Interne -------------------------------------------------------------------------------

  private async afterPayment(orderId: string, invoiceId: string | null): Promise<void> {
    try {
      if (invoiceId) {
        await this.documents.add(
          'invoice-pdf',
          { invoiceId },
          { jobId: `invoice-pdf-${invoiceId}` },
        );
      }
      const order = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: ORDER_SELECT,
      });
      const pickup = await this.settings.get(PICKUP_DETAILS);
      const shipping = order.shippingAddress as unknown as StoredAddress | null;
      await this.mail.send('order-confirmed', order.email, {
        firstName: order.firstName,
        reference: orderReference(order.number),
        itemLines: order.items.map(
          (item) =>
            `${item.quantity} × ${item.productName} (${item.variantLabel}) : ${formatEuros(item.unitPriceCents * item.quantity)}`,
        ),
        subtotal: formatEuros(order.subtotalCents),
        shipping: order.shippingCents === 0 ? 'offerte' : formatEuros(order.shippingCents),
        total: formatEuros(order.totalCents),
        deliveryLine: shipping
          ? `${order.shippingRateName} : ${shipping.firstName} ${shipping.lastName}, ${shipping.line1}, ${shipping.postalCode} ${shipping.city}`
          : `${order.shippingRateName}${pickup ? ` : ${pickup}` : ''}`,
        trackingLink: this.trackingLink(orderId),
      });
      await this.stock.refreshLowStockAlert(
        order.items.flatMap((item) => (item.variantId ? [item.variantId] : [])),
      );
    } catch (error) {
      // Le paiement est enregistré : un e-mail ou un PDF en échec ne doit pas l'annuler.
      this.logger.error({ err: error }, `Suites du paiement de la commande ${orderId} incomplètes`);
    }
  }

  private adminWhere(query: {
    status?: OrderStatus;
    from?: string;
    to?: string;
  }): Prisma.OrderWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: dateBound(query.from, false) } : {}),
              ...(query.to ? { lt: dateBound(query.to, true) } : {}),
            },
          }
        : {}),
    };
  }

  private summary(row: {
    id: string;
    number: number;
    status: OrderStatus;
    totalCents: number;
    createdAt: Date;
    items: { quantity: number }[];
  }): OrderSummaryDto {
    return {
      id: row.id,
      reference: orderReference(row.number),
      status: row.status,
      statusLabel: ORDER_STATUS_LABELS[row.status],
      totalCents: row.totalCents,
      itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
      createdAt: row.createdAt,
    };
  }

  /** Vue cliente : les notes d'historique (internes) ne sont montrées qu'à l'administration. */
  private toOrder(row: OrderRow, withNotes = false): OrderDto {
    return {
      ...this.summary(row),
      items: row.items.map((item) => ({
        productName: item.productName,
        variantLabel: item.variantLabel,
        sku: item.sku,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: item.unitPriceCents * item.quantity,
      })),
      subtotalCents: row.subtotalCents,
      shippingCents: row.shippingCents,
      refundedCents: row.refundedCents,
      shippingMethod: row.shippingMethod,
      shippingRateName: row.shippingRateName,
      shippingAddress: row.shippingAddress as unknown as OrderAddressDto | null,
      carrier: row.carrier,
      trackingNumber: row.trackingNumber,
      reservationExpiresAt: row.reservationExpiresAt,
      paidAt: row.paidAt,
      shippedAt: row.shippedAt,
      deliveredAt: row.deliveredAt,
      invoiceAvailable: Boolean(row.invoice?.pdfKey),
      timeline: row.events.map((event) => ({ ...event, note: withNotes ? event.note : null })),
    };
  }
}
