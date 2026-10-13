import { Module } from '@nestjs/common';
import { PaymentsCoreModule } from './payments-core.module';
import {
  AdminPaymentsController,
  PaymentsController,
  WebhooksController,
} from './payments.controller';
import { WebhookIpGuard } from './webhooks/webhook-ip.guard';
import { WebhooksService } from './webhooks/webhooks.service';

/** Paiements (API) : pages de paiement, retour PayPal, webhooks, remboursements. */
@Module({
  imports: [PaymentsCoreModule],
  controllers: [PaymentsController, WebhooksController, AdminPaymentsController],
  providers: [WebhooksService, WebhookIpGuard],
})
export class PaymentsModule {}
