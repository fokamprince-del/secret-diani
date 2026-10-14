import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { REVALIDATE_QUEUE, type RevalidateJobData } from './revalidate.constants';

/**
 * Prévient le frontend (Next.js, ISR) qu'un contenu a changé : ses pages statiques sont
 * régénérées sans redéploiement. Chaque instance du frontend a son propre cache : toutes les
 * adresses configurées sont prévenues (D-097). URL fixées par la configuration (aucune URL
 * fournie par un utilisateur : pas de SSRF). Sans configuration, le job ne fait rien. Un échec
 * relance le job entier : la revalidation est idempotente.
 */
@Processor(REVALIDATE_QUEUE)
export class RevalidateProcessor extends WorkerHost {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  async process(job: Job<RevalidateJobData>): Promise<void> {
    const urls = this.config.get('FRONTEND_REVALIDATE_URL');
    const secret = this.config.get('FRONTEND_REVALIDATE_SECRET');
    if (!urls || urls.length === 0 || !secret) return;
    const body = JSON.stringify({ tags: job.data.tags });
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        });
        if (!response.ok) throw new Error(`Revalidation refusée (${response.status})`);
      }),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason as Error;
  }
}
