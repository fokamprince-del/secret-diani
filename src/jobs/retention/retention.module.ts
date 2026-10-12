import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MAINTENANCE_QUEUE, RetentionProcessor } from './retention.processor';
import { RetentionService } from './retention.service';

/** Purge RGPD des données expirées (worker uniquement). */
@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  providers: [RetentionService, RetentionProcessor],
  exports: [RetentionService],
})
export class RetentionModule {}
