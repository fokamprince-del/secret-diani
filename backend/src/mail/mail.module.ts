import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MAIL_QUEUE } from './mail.constants';
import { MailService } from './mail.service';

/** Producteur d'e-mails (API). Le consommateur est enregistré dans le worker (MailWorkerModule). */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
