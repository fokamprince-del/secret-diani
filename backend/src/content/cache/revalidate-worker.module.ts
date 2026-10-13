import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { REVALIDATE_QUEUE } from './revalidate.constants';
import { RevalidateProcessor } from './revalidate.processor';

/** Revalidation du frontend (worker uniquement). */
@Module({
  imports: [BullModule.registerQueue({ name: REVALIDATE_QUEUE })],
  providers: [RevalidateProcessor],
})
export class RevalidateWorkerModule {}
