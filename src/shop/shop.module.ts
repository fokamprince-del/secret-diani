import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import {
  AdminOrdersController,
  AdminShopController,
  MyOrdersController,
} from './admin-shop.controller';
import { CartService } from './cart/cart.service';
import { AdminShopProductsService } from './catalog/admin-products.service';
import { ShopCatalogService } from './catalog/shop-catalog.service';
import { InvoicesService } from './invoices/invoices.service';
import { CheckoutService } from './orders/checkout.service';
import { OrderLinkService } from './orders/order-link.service';
import { OrdersService } from './orders/orders.service';
import { ShippingService } from './shipping/shipping.service';
import { DOCUMENTS_QUEUE } from './shop.constants';
import { CartController, CartMergeController, ShopController } from './shop.controller';
import { StockLedger } from './stock/stock-ledger';
import { StockService } from './stock/stock.service';

/** Boutique : catalogue, panier, livraison, commandes, stock, factures (API). */
@Module({
  imports: [ContentModule, BullModule.registerQueue({ name: DOCUMENTS_QUEUE })],
  controllers: [
    ShopController,
    CartController,
    CartMergeController,
    MyOrdersController,
    AdminShopController,
    AdminOrdersController,
  ],
  providers: [
    ShopCatalogService,
    AdminShopProductsService,
    StockLedger,
    StockService,
    ShippingService,
    CartService,
    CheckoutService,
    OrderLinkService,
    OrdersService,
    InvoicesService,
  ],
  // Paiements (phase 6) : confirmation, remboursement, remise en stock.
  exports: [OrdersService, StockLedger, OrderLinkService],
})
export class ShopModule {}
