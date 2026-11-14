import { Module } from '@nestjs/common';
import { REVALIDATE_QUEUE } from './revalidate.constants';
import { registerQueue } from '../../jobs/queue-mode';
import { RevalidateProcessor } from './revalidate.processor';

/** Revalidation du frontend (worker uniquement). */
@Module({
  imports: [registerQueue(REVALIDATE_QUEUE)],
  providers: [RevalidateProcessor],
})
export class RevalidateWorkerModule {}
