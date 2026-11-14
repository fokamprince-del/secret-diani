import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { AppConfigService } from '../config/app-config.service';
import { AttachmentNotReady, MailAttachmentsService } from './mail-attachments.service';
import { MAIL_QUEUE } from './mail.constants';
import { renderMail } from './templates/render';
import type { MailJob } from './templates/template-data';
import type { OutgoingMail } from './transports/mail-transport';
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
    private readonly attachments: MailAttachmentsService,
  ) {
    super();
  }

  /**
   * Facture jointe à la confirmation de commande. Pas encore produite : l'envoi est relancé
   * (délais croissants de la file) ; au-delà de 3 essais, l'e-mail part sans la pièce jointe,
   * avec le lien de suivi qui permet de la télécharger.
   */
  private async prepare(job: Job<MailJob>): Promise<{
    data: MailJob;
    attachments: OutgoingMail['attachments'];
  }> {
    if (job.data.template !== 'order-confirmed' || !job.data.data.invoiceId) {
      return { data: job.data, attachments: undefined };
    }
    try {
      const file = await this.attachments.invoice(job.data.data.invoiceId);
      return {
        data: { ...job.data, data: { ...job.data.data, invoiceAttached: true } },
        attachments: [file],
      };
    } catch (error) {
      if (error instanceof AttachmentNotReady && job.attemptsMade < 3) throw error;
      this.logger.warn(
        { jobId: job.id, err: error },
        'Facture non jointe : e-mail envoyé avec le lien de suivi',
      );
      return { data: job.data, attachments: undefined };
    }
  }

  async process(job: Job<MailJob>): Promise<void> {
    const { data, attachments } = await this.prepare(job);
    const rendered = renderMail(data);
    const replyTo = rendered.replyTo ?? this.config.get('MAIL_REPLY_TO');
    try {
      await this.transport.send({
        from: this.config.get('MAIL_FROM'),
        to: job.data.to,
        ...(replyTo ? { replyTo } : {}),
        ...rendered,
        ...(attachments ? { attachments } : {}),
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
