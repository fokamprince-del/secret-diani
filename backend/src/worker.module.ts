import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AppConfigModule } from './config/config.module';
import { RevalidateWorkerModule } from './content/cache/revalidate-worker.module';
import { JobsModule } from './jobs/jobs.module';
import { RetentionModule } from './jobs/retention/retention.module';
import { WorkerHeartbeatService } from './jobs/worker-heartbeat.service';
import { LoggingModule } from './logging/logging.module';
import { MailModule } from './mail/mail.module';
import { MailWorkerModule } from './mail/mail-worker.module';
import { MediaWorkerModule } from './media/media-worker.module';
import { PrismaModule } from './prisma/prisma.module';
import { PaymentsWorkerModule } from './payments/worker/payments.processor';
import { RedisModule } from './redis/redis.module';
import { SettingsModule } from './settings/settings.module';
import { ShopWorkerModule } from './shop/worker/shop-worker.module';
import { StorageModule } from './storage/storage.module';

/** Module du conteneur `worker` : consommateurs des files BullMQ (e-mails, PDF, images, webhooks). */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    JobsModule,
    MailWorkerModule,
    RetentionModule,
    StorageModule,
    MediaWorkerModule,
    RevalidateWorkerModule,
    ShopWorkerModule,
    // Confirmation des paiements (webhooks) : commandes, factures, e-mails, audit.
    MailModule,
    AuditModule,
    CryptoModule,
    SettingsModule,
    PaymentsWorkerModule,
  ],
  providers: [WorkerHeartbeatService],
})
export class WorkerModule {}
