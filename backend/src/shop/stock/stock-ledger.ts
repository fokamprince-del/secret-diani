import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { availableQuantity } from '../domain/availability';

export interface StockLine {
  variantId: string;
  quantity: number;
  productName?: string;
}

export function outOfStock(lines: { productName: string; available: number }[]): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.OUT_OF_STOCK,
    lines.length === 1
      ? `Stock insuffisant pour « ${lines[0]!.productName} » : il en reste ${lines[0]!.available}.`
      : 'Stock insuffisant pour certains articles : votre panier a été mis à jour.',
    lines.map((line) => ({
      field: line.productName,
      messages: [`il en reste ${line.available}`],
    })),
  );
}

/** Ordre fixe des verrous (par identifiant) : deux commandes simultanées ne s'interbloquent pas. */
function sorted(lines: StockLine[]): StockLine[] {
  return [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
}

/**
 * Écritures de stock, toujours dans la transaction de l'appelant. Chaque écriture est une mise
 * à jour conditionnelle atomique (« seulement s'il en reste assez ») : deux paniers ne peuvent
 * jamais se partager la dernière pièce. En dernier recours, la base refuse tout stock négatif ou
 * toute réservation supérieure au stock (contraintes CHECK). Sans dépendance : partagé par
 * l'API et le worker.
 */
@Injectable()
export class StockLedger {
  /** Réserve le stock d'une commande à payer ; échoue entièrement si une ligne manque. */
  async reserve(
    tx: Prisma.TransactionClient,
    orderId: string,
    lines: StockLine[],
    expiresAt: Date,
  ): Promise<void> {
    for (const line of sorted(lines)) {
      const updated = await tx.$executeRaw`
        UPDATE shop_stocks SET reserved = reserved + ${line.quantity}, updated_at = now()
        WHERE variant_id = ${line.variantId}::uuid AND on_hand - reserved >= ${line.quantity}`;
      if (updated === 0) {
        const stock = await tx.shopStock.findUnique({
          where: { variantId: line.variantId },
          select: { onHand: true, reserved: true },
        });
        throw outOfStock([
          { productName: line.productName ?? 'cet article', available: availableQuantity(stock) },
        ]);
      }
      await tx.stockReservation.create({
        data: { orderId, variantId: line.variantId, quantity: line.quantity, expiresAt },
      });
    }
  }

  /**
   * Paiement confirmé : les réservations deviennent des ventes. Une ligne dont la réservation a
   * expiré entre-temps est vendue sur le disponible ; renvoie false si le stock manque alors
   * (l'appelant annule sa transaction, la commande doit être remboursée).
   */
  async consume(
    tx: Prisma.TransactionClient,
    orderId: string,
    lines: StockLine[],
  ): Promise<boolean> {
    const now = new Date();
    for (const line of sorted(lines)) {
      const reservation = await tx.stockReservation.findFirst({
        where: { orderId, variantId: line.variantId, consumedAt: null, releasedAt: null },
        select: { id: true, quantity: true },
      });
      let updated: number;
      if (reservation && reservation.quantity === line.quantity) {
        updated = await tx.$executeRaw`
          UPDATE shop_stocks
          SET on_hand = on_hand - ${line.quantity}, reserved = reserved - ${line.quantity}, updated_at = now()
          WHERE variant_id = ${line.variantId}::uuid AND reserved >= ${line.quantity}`;
        await tx.stockReservation.update({
          where: { id: reservation.id },
          data: { consumedAt: now },
        });
      } else {
        updated = await tx.$executeRaw`
          UPDATE shop_stocks SET on_hand = on_hand - ${line.quantity}, updated_at = now()
          WHERE variant_id = ${line.variantId}::uuid AND on_hand - reserved >= ${line.quantity}`;
      }
      if (updated === 0) return false;
      await tx.shopStockMovement.create({
        data: { variantId: line.variantId, delta: -line.quantity, reason: 'sale', orderId },
      });
    }
    return true;
  }

  /** Libère les réservations encore ouvertes d'une commande (expiration, annulation). */
  async release(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const open = await tx.stockReservation.findMany({
      where: { orderId, consumedAt: null, releasedAt: null },
      orderBy: { variantId: 'asc' },
      select: { id: true, variantId: true, quantity: true },
    });
    for (const reservation of open) {
      await tx.$executeRaw`
        UPDATE shop_stocks SET reserved = reserved - ${reservation.quantity}, updated_at = now()
        WHERE variant_id = ${reservation.variantId}::uuid`;
    }
    if (open.length > 0) {
      await tx.stockReservation.updateMany({
        where: { id: { in: open.map((reservation) => reservation.id) } },
        data: { releasedAt: new Date() },
      });
    }
  }

  /** Remise en stock (remboursement avec retour des articles : phase 6). */
  async restock(
    tx: Prisma.TransactionClient,
    orderId: string,
    lines: StockLine[],
    actorId: string | null,
  ): Promise<void> {
    for (const line of sorted(lines)) {
      await tx.$executeRaw`
        UPDATE shop_stocks SET on_hand = on_hand + ${line.quantity}, updated_at = now()
        WHERE variant_id = ${line.variantId}::uuid`;
      await tx.shopStockMovement.create({
        data: {
          variantId: line.variantId,
          delta: line.quantity,
          reason: 'restock',
          orderId,
          actorId,
        },
      });
    }
  }
}
