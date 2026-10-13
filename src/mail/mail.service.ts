import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { MAIL_QUEUE } from './mail.constants';
import type { MailJob, MailTemplate, MailTemplateData } from './templates/template-data';

/** E-mails transactionnels : l'API ne fait que mettre en file, l'envoi réel se fait dans le worker. */
@Injectable()
export class MailService {
  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJob>,
    private readonly prisma: PrismaService,
  ) {}

  async send<T extends MailTemplate>(
    template: T,
    to: string,
    data: MailTemplateData[T],
  ): Promise<void> {
    await this.queue.add(template, { template, to, data } as MailJob);
  }

  /** Notification à chaque administratrice active (demande traiteur, stock bas, contact…). */
  async sendToAdmins<T extends MailTemplate>(
    template: T,
    data: MailTemplateData[T],
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', status: 'active', deletedAt: null, emailVerifiedAt: { not: null } },
      select: { email: true },
    });
    await Promise.all(admins.map((admin) => this.send(template, admin.email, data)));
  }
}
