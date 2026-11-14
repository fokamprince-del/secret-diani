import { Module } from '@nestjs/common';
import { MAINTENANCE_QUEUE, RetentionProcessor } from './retention.processor';
import { registerQueue } from '../queue-mode';
import { RetentionService } from './retention.service';

/** Purge RGPD des données expirées (worker uniquement). */
@Module({
  imports: [registerQueue(MAINTENANCE_QUEUE)],
  providers: [RetentionService, RetentionProcessor],
  exports: [RetentionService],
})
export class RetentionModule {}
