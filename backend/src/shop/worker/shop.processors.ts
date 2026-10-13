import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { OrderExpiryService } from '../orders/order-expiry.service';
import { EXPIRE_ORDERS_JOB, SHOP_MAINTENANCE_QUEUE } from '../shop.constants';

/** Chaque minute : les commandes non payées dans le délai libèrent leur stock. */
@Processor(SHOP_MAINTENANCE_QUEUE)
export class ShopMaintenanceProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ShopMaintenanceProcessor.name);

  constructor(
    private readonly expiry: OrderExpiryService,
    @InjectQueue(SHOP_MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Idempotent : une seule planification, quel que soit le nombre de workers.
    await this.queue.upsertJobScheduler(
      EXPIRE_ORDERS_JOB,
      { every: 60_000 },
      { name: EXPIRE_ORDERS_JOB },
    );
  }

  async process(job: Job): Promise<number | undefined> {
    if (job.name !== EXPIRE_ORDERS_JOB) return undefined;
    const expired = await this.expiry.expireOverdue();
    if (expired > 0)
      this.logger.log(`${expired} commande(s) non payée(s) annulée(s), stock libéré`);
    return expired;
  }
}
