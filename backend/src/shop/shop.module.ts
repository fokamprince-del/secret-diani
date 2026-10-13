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
import { CheckoutService } from './orders/checkout.service';
import { ShippingService } from './shipping/shipping.service';
import { ShopCoreModule } from './shop-core.module';
import { CartController, CartMergeController, ShopController } from './shop.controller';

/** Boutique : catalogue, panier, livraison, commandes, stock, factures (API). */
@Module({
  imports: [ContentModule, ShopCoreModule],
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
    ShippingService,
    CartService,
    CheckoutService,
  ],
})
export class ShopModule {}
