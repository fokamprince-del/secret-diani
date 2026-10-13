import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OrderExpiryService } from '../orders/order-expiry.service';
import { SHOP_MAINTENANCE_QUEUE } from '../shop.constants';
import { StockLedger } from '../stock/stock-ledger';
import { ShopMaintenanceProcessor } from './shop.processors';

/** Boutique côté worker : expiration des paiements non aboutis (les PDF : DocumentsWorkerModule). */
@Module({
  imports: [BullModule.registerQueue({ name: SHOP_MAINTENANCE_QUEUE })],
  providers: [OrderExpiryService, StockLedger, ShopMaintenanceProcessor],
})
export class ShopWorkerModule {}
