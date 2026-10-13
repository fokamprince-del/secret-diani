import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { notFound } from '../../content/common/content.helpers';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { availableQuantity } from '../domain/availability';
import type { AdminStockDto, StockMovementDto } from '../dto/admin.dto';

/**
 * Administration du stock (inventaire, réassort, seuils, historique) et alertes « stock bas ».
 * Les écritures liées aux commandes passent par `StockLedger`.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  // --- Administration ----------------------------------------------------------------------

  async list(): Promise<AdminStockDto[]> {
    const rows = await this.prisma.shopStock.findMany({
      where: { variant: { product: { deletedAt: null } } },
      orderBy: [{ variant: { product: { name: 'asc' } } }, { variant: { position: 'asc' } }],
      take: 1000,
      select: {
        variantId: true,
        onHand: true,
        reserved: true,
        lowStockThreshold: true,
        variant: { select: { sku: true, label: true, product: { select: { name: true } } } },
      },
    });
    return rows.map((row) => this.toAdmin(row));
  }

  /** Inventaire ou réassort : refusé s'il ferait descendre le stock sous les réservations. */
  async adjust(
    variantId: string,
    delta: number,
    note: string,
    actorId: string,
  ): Promise<AdminStockDto> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE shop_stocks SET on_hand = on_hand + ${delta}, updated_at = now()
        WHERE variant_id = ${variantId}::uuid AND on_hand + ${delta} >= reserved`;
      if (updated === 0) {
        const exists = await tx.shopStock.findUnique({
          where: { variantId },
          select: { reserved: true },
        });
        if (!exists) throw notFound('Variante introuvable.');
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.CONFLICT,
          `Impossible : ${exists.reserved} pièce(s) sont réservées par des paiements en cours.`,
        );
      }
      await tx.shopStockMovement.create({
        data: { variantId, delta, reason: 'adjustment', actorId, note },
      });
    });
    await this.audit.log({
      action: AuditAction.SHOP_STOCK_ADJUSTED,
      actorId,
      targetType: 'shop_variant',
      targetId: variantId,
      metadata: { delta },
    });
    await this.refreshLowStockAlert([variantId]);
    return this.get(variantId);
  }

  async setThreshold(
    variantId: string,
    threshold: number,
    actorId: string,
  ): Promise<AdminStockDto> {
    const updated = await this.prisma.shopStock.updateMany({
      where: { variantId },
      data: { lowStockThreshold: threshold, lowStockAlertedAt: null },
    });
    if (updated.count === 0) throw notFound('Variante introuvable.');
    await this.audit.log({
      action: AuditAction.SHOP_STOCK_ADJUSTED,
      actorId,
      targetType: 'shop_variant',
      targetId: variantId,
      metadata: { lowStockThreshold: threshold },
    });
    await this.refreshLowStockAlert([variantId]);
    return this.get(variantId);
  }

  movements(variantId: string): Promise<StockMovementDto[]> {
    return this.prisma.shopStockMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        delta: true,
        reason: true,
        orderId: true,
        actorId: true,
        note: true,
        createdAt: true,
      },
    });
  }

  /**
   * Alerte « stock bas » : un e-mail aux administratrices quand une variante passe sous son
   * seuil, une seule fois jusqu'au réassort (la date d'alerte est remise à zéro au-dessus).
   */
  async refreshLowStockAlert(variantIds: string[]): Promise<void> {
    if (variantIds.length === 0) return;
    try {
      const stocks = await this.prisma.shopStock.findMany({
        where: {
          variantId: { in: variantIds },
          variant: { active: true, product: { deletedAt: null } },
        },
        select: {
          variantId: true,
          onHand: true,
          reserved: true,
          lowStockThreshold: true,
          lowStockAlertedAt: true,
          variant: { select: { sku: true, label: true, product: { select: { name: true } } } },
        },
      });
      const low = stocks.filter((stock) => availableQuantity(stock) <= stock.lowStockThreshold);
      const recovered = stocks.filter(
        (stock) => availableQuantity(stock) > stock.lowStockThreshold && stock.lowStockAlertedAt,
      );
      if (recovered.length > 0) {
        await this.prisma.shopStock.updateMany({
          where: { variantId: { in: recovered.map((stock) => stock.variantId) } },
          data: { lowStockAlertedAt: null },
        });
      }
      const toAlert = low.filter((stock) => !stock.lowStockAlertedAt);
      if (toAlert.length === 0) return;
      // Marquage conditionnel : une seule alerte même si deux ventes simultanées la déclenchent.
      const claimed = await this.prisma.shopStock.updateMany({
        where: {
          variantId: { in: toAlert.map((stock) => stock.variantId) },
          lowStockAlertedAt: null,
        },
        data: { lowStockAlertedAt: new Date() },
      });
      if (claimed.count === 0) return;
      await this.mail.sendToAdmins('stock-low', {
        lines: toAlert.map(
          (stock) =>
            `${stock.variant.product.name} (${stock.variant.label}, ${stock.variant.sku}) : ${availableQuantity(stock)} disponible(s), seuil ${stock.lowStockThreshold}`,
        ),
      });
    } catch (error) {
      // L'alerte ne doit jamais faire échouer une vente.
      this.logger.error({ err: error }, 'Alerte de stock bas non envoyée');
    }
  }

  private async get(variantId: string): Promise<AdminStockDto> {
    const row = await this.prisma.shopStock.findUnique({
      where: { variantId },
      select: {
        variantId: true,
        onHand: true,
        reserved: true,
        lowStockThreshold: true,
        variant: { select: { sku: true, label: true, product: { select: { name: true } } } },
      },
    });
    if (!row) throw notFound('Variante introuvable.');
    return this.toAdmin(row);
  }

  private toAdmin(row: {
    variantId: string;
    onHand: number;
    reserved: number;
    lowStockThreshold: number;
    variant: { sku: string; label: string; product: { name: string } };
  }): AdminStockDto {
    const available = availableQuantity(row);
    return {
      variantId: row.variantId,
      sku: row.variant.sku,
      productName: row.variant.product.name,
      variantLabel: row.variant.label,
      onHand: row.onHand,
      reserved: row.reserved,
      available,
      lowStockThreshold: row.lowStockThreshold,
      low: available <= row.lowStockThreshold,
    };
  }
}
