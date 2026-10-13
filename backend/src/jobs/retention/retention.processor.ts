import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { type PurgeReport, RetentionService } from './retention.service';

export const MAINTENANCE_QUEUE = 'maintenance';
export const RETENTION_JOB = 'retention-purge';

/** Purge quotidienne (3 h 30, heure de Paris), planifiée par le worker au démarrage. */
@Processor(MAINTENANCE_QUEUE)
export class RetentionProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly retention: RetentionService,
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Idempotent : une seule planification, quel que soit le nombre de workers.
    await this.queue.upsertJobScheduler(
      RETENTION_JOB,
      { pattern: '30 3 * * *', tz: 'Europe/Paris' },
      { name: RETENTION_JOB },
    );
  }

  async process(job: Job): Promise<PurgeReport | undefined> {
    if (job.name !== RETENTION_JOB) return undefined;
    return this.retention.purge();
  }
}
