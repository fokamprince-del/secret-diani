import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { REDIS_CLIENT } from './redis.constants';
import { redisOptionsFromUrl } from './redis-options';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis({
          ...redisOptionsFromUrl(config.get('REDIS_URL')),
          lazyConnect: true,
          connectTimeout: 5_000,
          commandTimeout: 2_000,
          maxRetriesPerRequest: 2,
          keyPrefix: 'diani:',
        });
        client.on('error', (error: Error) => logger.warn(`Connexion Redis : ${error.message}`));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
