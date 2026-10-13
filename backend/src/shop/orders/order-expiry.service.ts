import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockLedger } from '../stock/stock-ledger';

export const EXPIRY_REASON = 'Paiement non reçu dans le délai';

/**
 * Paiements non aboutis : à l'échéance de la réservation, la commande est annulée et son stock
 * libéré (worker, chaque minute). Un paiement confirmé plus tard reste possible : il revend
 * le stock s'il est encore disponible, sinon il est remboursé (phase 6).
 */
@Injectable()
export class OrderExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: StockLedger,
  ) {}

  async expireOverdue(now: Date = new Date()): Promise<number> {
    const overdue = await this.prisma.order.findMany({
      where: { status: 'pending_payment', reservationExpiresAt: { lt: now } },
      orderBy: { reservationExpiresAt: 'asc' },
      take: 200,
      select: { id: true },
    });
    let expired = 0;
    for (const { id } of overdue) {
      const done = await this.prisma.$transaction(async (tx) => {
        // Conditionnel : un paiement confirmé entre-temps n'est jamais annulé.
        const cancelled = await tx.order.updateMany({
          where: { id, status: 'pending_payment', reservationExpiresAt: { lt: now } },
          data: {
            status: 'cancelled',
            cancelledAt: now,
            cancellationReason: EXPIRY_REASON,
            reservationExpiresAt: null,
          },
        });
        if (cancelled.count === 0) return false;
        await this.ledger.release(tx, id);
        await tx.orderEvent.create({
          data: {
            orderId: id,
            fromStatus: 'pending_payment',
            toStatus: 'cancelled',
            note: EXPIRY_REASON,
          },
        });
        return true;
      });
      if (done) expired += 1;
    }
    return expired;
  }
}
