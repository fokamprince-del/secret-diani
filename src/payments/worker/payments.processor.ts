import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PaymentsCoreModule } from '../payments-core.module';
import {
  PAYMENTS_QUEUE,
  RECONCILE_JOB,
  WEBHOOK_JOB,
  type WebhookJobData,
} from '../payments.constants';
import { ReconciliationService } from '../reconciliation.service';
import { WebhookHandlerService } from '../webhooks/webhook-handler.service';

/** Webhooks de paiement (relances exponentielles de BullMQ) et réconciliation quotidienne. */
@Processor(PAYMENTS_QUEUE)
export class PaymentsProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly webhooks: WebhookHandlerService,
    private readonly reconciliation: ReconciliationService,
    @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Chaque jour à 4 h 15 (heure de Paris), une seule planification quel que soit le nombre de workers.
    await this.queue.upsertJobScheduler(
      RECONCILE_JOB,
      { pattern: '15 4 * * *', tz: 'Europe/Paris' },
      { name: RECONCILE_JOB },
    );
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === WEBHOOK_JOB)
      return this.webhooks.process((job.data as WebhookJobData).webhookEventId);
    if (job.name === RECONCILE_JOB) return this.reconciliation.run();
    return undefined;
  }
}

/** Paiements côté worker. */
@Module({
  imports: [PaymentsCoreModule],
  providers: [WebhookHandlerService, ReconciliationService, PaymentsProcessor],
})
export class PaymentsWorkerModule {}
