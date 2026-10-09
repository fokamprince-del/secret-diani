import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

export type CheckStatus = 'ok' | 'erreur';

export interface ReadinessReport {
  ready: boolean;
  checks: { database: CheckStatus; redis: CheckStatus };
}

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`délai de ${ms} ms dépassé`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.check('database', () => this.prisma.ping()),
      this.check('redis', async () => {
        await this.redis.ping();
      }),
    ]);
    return { ready: database === 'ok' && redis === 'ok', checks: { database, redis } };
  }

  private async check(name: string, probe: () => Promise<void>): Promise<CheckStatus> {
    try {
      await withTimeout(probe(), CHECK_TIMEOUT_MS);
      return 'ok';
    } catch (error: unknown) {
      this.logger.warn(`Vérification ${name} en échec : ${(error as Error).message}`);
      return 'erreur';
    }
  }
}
