import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices/invoices.service';
import { OrderLinkService } from './orders/order-link.service';
import { OrdersService } from './orders/orders.service';
import { DOCUMENTS_QUEUE } from './shop.constants';
import { StockLedger } from './stock/stock-ledger';
import { StockService } from './stock/stock.service';

/**
 * Cœur des commandes (sans contrôleur) : confirmation de paiement, stock, factures, liens de
 * suivi. Partagé par l'API et par le worker (traitement des webhooks de paiement).
 */
@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENTS_QUEUE })],
  providers: [StockLedger, StockService, InvoicesService, OrderLinkService, OrdersService],
  exports: [StockLedger, StockService, InvoicesService, OrderLinkService, OrdersService],
})
export class ShopCoreModule {}
