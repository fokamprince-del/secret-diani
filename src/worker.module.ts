import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { JobsModule } from './jobs/jobs.module';
import { RetentionModule } from './jobs/retention/retention.module';
import { WorkerHeartbeatService } from './jobs/worker-heartbeat.service';
import { LoggingModule } from './logging/logging.module';
import { MailWorkerModule } from './mail/mail-worker.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

/** Module du conteneur `worker` : consommateurs des files BullMQ (e-mails, PDF, images, webhooks). */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    JobsModule,
    MailWorkerModule,
    RetentionModule,
  ],
  providers: [WorkerHeartbeatService],
})
export class WorkerModule {}
