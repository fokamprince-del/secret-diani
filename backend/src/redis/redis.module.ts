import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { MemoryRedis } from './memory-redis';
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
        const url = config.get('REDIS_URL');
        if (!url) {
          // Sans Redis : une seule instance, état en mémoire (voir memory-redis.ts).
          logger.log('REDIS_URL absent : stockage en mémoire et tâches exécutées dans l’API.');
          return new MemoryRedis() as unknown as Redis;
        }
        const client = new Redis({
          ...redisOptionsFromUrl(url),
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
