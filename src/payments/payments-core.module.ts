import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ShopCoreModule } from '../shop/shop-core.module';
import { PayPalGateway } from './gateways/paypal.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { PAYMENT_FETCH, PAYMENTS_QUEUE } from './payments.constants';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

/** Cœur des paiements (sans contrôleur), partagé par l'API et le worker. */
@Module({
  imports: [ShopCoreModule, BullModule.registerQueue({ name: PAYMENTS_QUEUE })],
  providers: [
    // `fetch` natif ; remplacé par un faux prestataire dans les tests e2e.
    { provide: PAYMENT_FETCH, useValue: globalThis.fetch.bind(globalThis) },
    StripeGateway,
    PayPalGateway,
    RefundsService,
    PaymentsService,
  ],
  exports: [
    ShopCoreModule,
    BullModule,
    StripeGateway,
    PayPalGateway,
    RefundsService,
    PaymentsService,
  ],
})
export class PaymentsCoreModule {}
