import { Module } from '@nestjs/common';
import { ShopCoreModule } from '../shop/shop-core.module';
import { PayPalGateway } from './gateways/paypal.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { PAYMENT_FETCH, PAYMENTS_QUEUE } from './payments.constants';
import { PaymentsService } from './payments.service';
import { registerQueue } from '../jobs/queue-mode';
import { RefundsService } from './refunds.service';

const PAYMENTS_QUEUE_MODULE = registerQueue(PAYMENTS_QUEUE);

/** Cœur des paiements (sans contrôleur), partagé par l'API et le worker. */
@Module({
  imports: [ShopCoreModule, PAYMENTS_QUEUE_MODULE],
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
    PAYMENTS_QUEUE_MODULE,
    StripeGateway,
    PayPalGateway,
    RefundsService,
    PaymentsService,
  ],
})
export class PaymentsCoreModule {}
