import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MediaProcessingService, type ProcessingOutcome } from './media-processing.service';
import { MEDIA_JOB, MEDIA_QUEUE, type MediaJobData } from './media.types';

/** Consommateur de la file « media » (worker) : traitement des fichiers et purge des supprimés. */
@Processor(MEDIA_QUEUE, { concurrency: 2 })
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(private readonly processing: MediaProcessingService) {
    super();
  }

  async process(job: Job<MediaJobData>): Promise<ProcessingOutcome | void> {
    if (job.name === MEDIA_JOB.purge) return this.processing.purgeFiles(job.data.mediaId);
    const outcome = await this.processing.process(job.data.mediaId);
    this.logger.log({ mediaId: job.data.mediaId, outcome }, 'Média traité');
    return outcome;
  }

  /** Échec définitif après toutes les relances : le média est marqué refusé (visible en admin). */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaJobData> | undefined): Promise<void> {
    if (!job || job.name !== MEDIA_JOB.process) return;
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    await this.processing
      .reject(job.data.mediaId, 'Traitement impossible. Merci de réessayer avec un autre fichier.')
      .catch(() => undefined);
  }
}
