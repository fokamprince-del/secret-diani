import { getQueueToken } from '@nestjs/bullmq';
import {
  type DynamicModule,
  Global,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import { InlineQueue, type InlineConsumer, type InlineJob } from './inline-queue';

// Clés posées par les décorateurs @Processor et @OnWorkerEvent de @nestjs/bullmq.
const PROCESSOR_METADATA = 'bullmq:processor_metadata';
const ON_WORKER_EVENT_METADATA = 'bullmq:worker_events_metadata';

/** Une file par nom, partagée par tous les modules qui la déclarent. */
const QUEUES = new Map<string, InlineQueue>();

function queueNamed(name: string): InlineQueue {
  let queue = QUEUES.get(name);
  if (!queue) {
    queue = new InlineQueue(name);
    QUEUES.set(name, queue);
  }
  return queue;
}

/** Équivalent de `BullModule.registerQueue({ name })` sans Redis : même jeton d'injection. */
@Module({})
export class InlineQueueModule {
  static register(name: string): DynamicModule {
    const provider = { provide: getQueueToken(name), useFactory: () => queueNamed(name) };
    return { module: InlineQueueModule, providers: [provider], exports: [provider] };
  }
}

/**
 * Relie chaque classe @Processor(nom) à sa file au démarrage de l'API, avec ses écouteurs
 * @OnWorkerEvent('failed'), puis arrête les minuteries à l'arrêt.
 */
@Injectable()
class InlineQueueExplorer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Files');

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  onApplicationBootstrap(): void {
    const bound: string[] = [];
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance || !wrapper.metatype) continue;
      const options = Reflect.getMetadata(PROCESSOR_METADATA, wrapper.metatype) as
        { name?: string } | undefined;
      if (!options?.name) continue;
      const prototype = Object.getPrototypeOf(instance) as object;
      const onFailed = this.scanner
        .getAllMethodNames(prototype)
        .filter((method) => {
          const meta = Reflect.getMetadata(
            ON_WORKER_EVENT_METADATA,
            (prototype as Record<string, unknown>)[method] as object,
          ) as { eventName?: string } | undefined;
          return meta?.eventName === 'failed';
        })
        .map(
          (method) => (job: InlineJob, error: Error) =>
            (instance[method] as (j: InlineJob, e: Error) => unknown).call(instance, job, error),
        );
      const consumer: InlineConsumer = {
        process: (job) =>
          (instance.process as (j: InlineJob) => Promise<unknown>).call(instance, job),
        onFailed,
      };
      queueNamed(options.name).bind(consumer);
      bound.push(options.name);
    }
    this.logger.log(`Tâches exécutées dans l'API (sans Redis) : ${bound.sort().join(', ')}`);
  }

  onApplicationShutdown(): void {
    for (const queue of QUEUES.values()) queue.close();
    QUEUES.clear();
  }
}

/** Remplace JobsModule (BullModule.forRoot) quand REDIS_URL n'est pas défini. */
@Global()
@Module({ imports: [DiscoveryModule], providers: [InlineQueueExplorer] })
export class InlineJobsModule {}
