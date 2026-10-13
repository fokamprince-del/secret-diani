import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { AppConfigService } from '../config/app-config.service';
import { MAIL_QUEUE } from './mail.constants';
import { renderMail } from './templates/render';
import type { MailJob } from './templates/template-data';
import {
  MAIL_TRANSPORT,
  type MailTransport,
  PermanentMailError,
} from './transports/mail-transport';

/** Consommateur de la file « mail » (conteneur worker). Relances exponentielles via BullMQ. */
@Processor(MAIL_QUEUE, { concurrency: 5 })
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly config: AppConfigService,
  ) {
    super();
  }

  async process(job: Job<MailJob>): Promise<void> {
    const rendered = renderMail(job.data);
    const replyTo = rendered.replyTo ?? this.config.get('MAIL_REPLY_TO');
    try {
      await this.transport.send({
        from: this.config.get('MAIL_FROM'),
        to: job.data.to,
        ...(replyTo ? { replyTo } : {}),
        ...rendered,
        idempotencyKey: `mail-${job.id ?? job.name}`,
      });
    } catch (error) {
      if (error instanceof PermanentMailError) throw new UnrecoverableError(error.message);
      throw error;
    }
    // Ni destinataire ni contenu dans les journaux : uniquement le gabarit et l'identifiant du job.
    this.logger.log({ template: job.data.template, jobId: job.id }, 'E-mail envoyé');
  }
}
