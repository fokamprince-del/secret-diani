import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { redisOptionsFromUrl } from '../redis/redis-options';
import { InlineJobsModule } from './inline/inline-queue.module';
import { USE_REDIS } from './queue-mode';

/**
 * Configuration commune des files BullMQ (producteurs côté API, consommateurs côté worker).
 * Relances exponentielles ; les jobs en échec définitif sont conservés 30 jours
 * (ensemble « failed » de BullMQ = file des échecs, rejouable depuis l'admin).
 * Sans REDIS_URL : files exécutées dans l'API (InlineJobsModule, mêmes relances).
 */
@Module({
  imports: [
    USE_REDIS
      ? BullModule.forRootAsync({
          inject: [AppConfigService],
          useFactory: (config: AppConfigService) => ({
            prefix: 'diani:bull',
            connection: redisOptionsFromUrl(config.get('REDIS_URL')!),
            defaultJobOptions: {
              attempts: 5,
              backoff: { type: 'exponential', delay: 5_000 },
              removeOnComplete: { age: 24 * 3600, count: 1_000 },
              removeOnFail: { age: 30 * 24 * 3600 },
            },
          }),
        })
      : InlineJobsModule,
  ],
})
export class JobsModule {}
