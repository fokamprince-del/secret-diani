import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { REVALIDATE_QUEUE, type RevalidateJobData } from './revalidate.constants';

/**
 * Prévient le frontend (Next.js, ISR) qu'un contenu a changé : ses pages statiques sont
 * régénérées sans redéploiement. URL fixée par la configuration (aucune URL fournie
 * par un utilisateur : pas de SSRF). Sans configuration, le job ne fait rien.
 */
@Processor(REVALIDATE_QUEUE)
export class RevalidateProcessor extends WorkerHost {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  async process(job: Job<RevalidateJobData>): Promise<void> {
    const url = this.config.get('FRONTEND_REVALIDATE_URL');
    const secret = this.config.get('FRONTEND_REVALIDATE_SECRET');
    if (!url || !secret) return;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: job.data.tags }),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Revalidation refusée (${response.status})`);
  }
}
