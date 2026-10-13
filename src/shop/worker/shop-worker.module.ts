import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { InvoicesService } from '../invoices/invoices.service';
import { OrderExpiryService } from '../orders/order-expiry.service';
import { DOCUMENTS_QUEUE, SHOP_MAINTENANCE_QUEUE } from '../shop.constants';
import { StockLedger } from '../stock/stock-ledger';
import { DocumentsProcessor, ShopMaintenanceProcessor } from './shop.processors';

/** Boutique côté worker : factures PDF et expiration des paiements non aboutis. */
@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENTS_QUEUE }, { name: SHOP_MAINTENANCE_QUEUE })],
  providers: [
    InvoicesService,
    OrderExpiryService,
    StockLedger,
    DocumentsProcessor,
    ShopMaintenanceProcessor,
  ],
})
export class ShopWorkerModule {}
