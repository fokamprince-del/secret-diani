/* eslint-disable @typescript-eslint/require-await -- même interface asynchrone que la Queue de BullMQ. */
import { Logger } from '@nestjs/common';

/** Sous-ensemble de `Job` (bullmq) lu par les consommateurs du projet. */
export interface InlineJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  opts: InlineJobOptions;
  attemptsMade: number;
  timestamp: number;
}

export interface InlineJobOptions {
  jobId?: string;
  delay?: number;
  attempts?: number;
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  removeOnComplete?: boolean | { age?: number; count?: number };
  removeOnFail?: boolean | { age?: number };
}

/** Consommateur : la classe @Processor (WorkerHost) et ses écouteurs @OnWorkerEvent('failed'). */
export interface InlineConsumer {
  process(job: InlineJob): Promise<unknown>;
  onFailed: ((job: InlineJob, error: Error) => unknown)[];
}

/** Mêmes options par défaut que JobsModule (BullMQ). */
const DEFAULTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 } as const,
  completedRetentionMs: 24 * 3600 * 1000,
  failedRetentionMs: 30 * 24 * 3600 * 1000,
};

/** Planification quotidienne « M H * * * » (seule forme utilisée), à l'heure du fuseau donné. */
function dailyMatcher(pattern: string, timeZone: string): (now: Date) => string | null {
  const parts = pattern.trim().split(/\s+/);
  const [minute, hour, ...rest] = parts;
  if (parts.length !== 5 || rest.some((field) => field !== '*')) {
    throw new Error(`Planification non prise en charge sans Redis : « ${pattern} »`);
  }
  const format = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return (now) => {
    const values = Object.fromEntries(format.formatToParts(now).map((p) => [p.type, p.value]));
    if (Number(values.hour) !== Number(hour) || Number(values.minute) !== Number(minute)) {
      return null;
    }
    return `${values.year}-${values.month}-${values.day}`;
  };
}

/**
 * File exécutée dans le processus de l'API (sans Redis) : même interface que les appels faits
 * à `Queue` de BullMQ dans le projet (`add`, `upsertJobScheduler`), mêmes relances et même
 * dédoublonnage par `jobId`. Les tâches en attente sont perdues si l'API redémarre : les
 * traitements du projet sont idempotents et rattrapés (réconciliation, purge, relance admin).
 */
export class InlineQueue {
  private readonly logger: Logger;
  private consumer: InlineConsumer | undefined;
  private readonly waiting: InlineJob[] = [];
  /** jobId → échéance de conservation (doublons ignorés tant qu'elle n'est pas passée). */
  private readonly known = new Map<string, number>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private sequence = 0;
  private closed = false;

  constructor(readonly name: string) {
    this.logger = new Logger(`File ${name}`);
  }

  bind(consumer: InlineConsumer): void {
    this.consumer = consumer;
    for (const job of this.waiting.splice(0)) this.schedule(job, 0);
  }

  async add<T>(name: string, data: T, opts: InlineJobOptions = {}): Promise<InlineJob<T>> {
    const now = Date.now();
    const id = opts.jobId ?? `${this.name}-${++this.sequence}`;
    const until = this.known.get(id);
    const job: InlineJob<T> = { id, name, data, opts, attemptsMade: 0, timestamp: now };
    if (until !== undefined && until > now) return job;
    this.known.set(id, Number.POSITIVE_INFINITY);
    this.schedule(job, opts.delay ?? 0);
    return job;
  }

  async upsertJobScheduler(
    id: string,
    repeat: { every?: number; pattern?: string; tz?: string },
    template: { name: string; data?: unknown },
  ): Promise<void> {
    const run = (): void => {
      void this.add(template.name, template.data ?? {}, { jobId: `${id}-${Date.now()}` });
    };
    if (repeat.every) {
      this.interval(run, repeat.every);
      return;
    }
    if (repeat.pattern) {
      const matches = dailyMatcher(repeat.pattern, repeat.tz ?? 'Europe/Paris');
      let lastDay: string | null = null;
      this.interval(() => {
        const day = matches(new Date());
        if (day && day !== lastDay) {
          lastDay = day;
          run();
        }
      }, 30_000);
    }
  }

  close(): void {
    this.closed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private interval(callback: () => void, ms: number): void {
    const timer = setInterval(callback, ms);
    timer.unref();
    this.timers.add(timer);
  }

  private schedule(job: InlineJob, delay: number): void {
    if (this.closed) return;
    if (!this.consumer) {
      this.waiting.push(job);
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void this.run(job);
    }, delay);
    timer.unref();
    this.timers.add(timer);
  }

  private async run(job: InlineJob): Promise<void> {
    const consumer = this.consumer!;
    const attempts = job.opts.attempts ?? DEFAULTS.attempts;
    try {
      await consumer.process(job);
      job.attemptsMade++;
      this.retain(job, job.opts.removeOnComplete, DEFAULTS.completedRetentionMs);
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      job.attemptsMade++;
      const unrecoverable = error.name === 'UnrecoverableError';
      if (!unrecoverable && job.attemptsMade < attempts) {
        const backoff = job.opts.backoff ?? DEFAULTS.backoff;
        const wait =
          backoff.type === 'fixed' ? backoff.delay : backoff.delay * 2 ** (job.attemptsMade - 1);
        this.logger.warn(
          `${job.name} (${job.id}) : essai ${job.attemptsMade}/${attempts} en échec, relance dans ${Math.round(wait / 1000)} s : ${error.message}`,
        );
        this.schedule(job, wait);
        return;
      }
      // Échec définitif : les écouteurs « failed » voient le même nombre d'essais que BullMQ.
      if (unrecoverable) job.opts = { ...job.opts, attempts: job.attemptsMade };
      this.logger.error(`${job.name} (${job.id}) : échec définitif : ${error.message}`);
      this.retain(job, job.opts.removeOnFail, DEFAULTS.failedRetentionMs);
      for (const listener of consumer.onFailed) {
        try {
          await listener(job, error);
        } catch (listenerError) {
          this.logger.error(`Écouteur d'échec : ${(listenerError as Error).message}`);
        }
      }
    }
  }

  private retain(
    job: InlineJob,
    remove: boolean | { age?: number } | undefined,
    defaultMs: number,
  ): void {
    if (remove === true) {
      this.known.delete(job.id);
      return;
    }
    const ageMs = typeof remove === 'object' && remove.age ? remove.age * 1000 : defaultMs;
    this.known.set(job.id, Date.now() + ageMs);
    // Nettoyage sobre : au-delà de 10 000 identifiants, les plus anciens sont oubliés.
    if (this.known.size > 10_000) {
      const oldest = this.known.keys().next().value;
      if (oldest !== undefined) this.known.delete(oldest);
    }
  }
}
