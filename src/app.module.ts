import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AccessTokenGuard } from './auth/guards/access-token.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CryptoModule } from './common/crypto/crypto.module';
import { AppConfigModule } from './config/config.module';
import { ContentCacheModule } from './content/cache/content-cache.module';
import { ContentModule } from './content/content.module';
import { AppConfigService } from './config/app-config.service';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { LoggingModule } from './logging/logging.module';
import { MailModule } from './mail/mail.module';
import { MediaModule } from './media/media.module';
import { PrismaModule } from './prisma/prisma.module';
import { REDIS_CLIENT } from './redis/redis.constants';
import { RedisModule } from './redis/redis.module';
import { RgpdModule } from './rgpd/rgpd.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

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
    CryptoModule,
    AuditModule,
    MailModule,
    AuthModule,
    UsersModule,
    RgpdModule,
    StorageModule,
    ContentCacheModule,
    MediaModule,
    ContentModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Ordre d'exécution : limitation de débit → authentification (refus par défaut) → rôles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AccessTokenGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
  ],
})
export class AppModule {}
