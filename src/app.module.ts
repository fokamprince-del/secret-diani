import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { LoggingModule } from './logging/logging.module';
import { PrismaModule } from './prisma/prisma.module';
import { REDIS_CLIENT } from './redis/redis.constants';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    JobsModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService, REDIS_CLIENT],
      useFactory: (config: AppConfigService, redis: Redis) => ({
        throttlers: [
          {
            name: 'default',
            ttl: seconds(config.get('RATE_LIMIT_TTL_SECONDS')),
            limit: config.get('RATE_LIMIT_MAX'),
          },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
  ],
})
export class AppModule {}
