import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { hostname } from 'node:os';
import { REDIS_CLIENT } from '../redis/redis.constants';
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SECONDS,
} from './worker-heartbeat.constants';

/** Signal de vie du worker, utilisé par la sonde de santé du conteneur. */
@Injectable()
export class WorkerHeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private timer?: NodeJS.Timeout;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onApplicationBootstrap(): void {
    void this.beat();
    this.timer = setInterval(() => void this.beat(), WORKER_HEARTBEAT_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async beat(): Promise<void> {
    try {
      await this.redis.set(
        `${WORKER_HEARTBEAT_KEY}:${hostname()}`,
        new Date().toISOString(),
        'EX',
        WORKER_HEARTBEAT_TTL_SECONDS,
      );
    } catch (error: unknown) {
      this.logger.warn(`Battement de cœur non enregistré : ${(error as Error).message}`);
    }
  }
}
