import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { MAIL_QUEUE } from './mail.constants';
import type { MailJob, MailTemplate, MailTemplateData } from './templates/template-data';

/** E-mails transactionnels : l'API ne fait que mettre en file, l'envoi réel se fait dans le worker. */
@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJob>) {}

  async send<T extends MailTemplate>(
    template: T,
    to: string,
    data: MailTemplateData[T],
  ): Promise<void> {
    await this.queue.add(template, { template, to, data } as MailJob);
  }
}
