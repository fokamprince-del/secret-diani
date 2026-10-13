import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { MAIL_QUEUE } from './mail.constants';
import { MailProcessor } from './mail.processor';
import { MAIL_TRANSPORT, type MailTransport } from './transports/mail-transport';
import { OutboxTransport } from './transports/outbox.transport';
import { ResendTransport } from './transports/resend.transport';

/** Consommateur des e-mails (worker uniquement). */
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [
    MailProcessor,
    {
      provide: MAIL_TRANSPORT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): MailTransport => {
        const apiKey = config.get('RESEND_API_KEY');
        if (config.get('MAIL_TRANSPORT') === 'resend' && apiKey) return new ResendTransport(apiKey);
        return new OutboxTransport(config.get('MAIL_OUTBOX_DIR'));
      },
    },
  ],
})
export class MailWorkerModule {}
