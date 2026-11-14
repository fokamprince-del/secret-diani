import { Global, Module } from '@nestjs/common';
import { MAIL_QUEUE } from './mail.constants';
import { registerQueue } from '../jobs/queue-mode';
import { MailService } from './mail.service';

/** Producteur d'e-mails (API). Le consommateur est enregistré dans le worker (MailWorkerModule). */
@Global()
@Module({
  imports: [registerQueue(MAIL_QUEUE)],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
