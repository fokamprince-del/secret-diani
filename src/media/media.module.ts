import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MEDIA_QUEUE } from './media.types';

/** Médiathèque côté API (envoi, liste, suppression). Le traitement est dans MediaWorkerModule. */
@Module({
  imports: [BullModule.registerQueue({ name: MEDIA_QUEUE })],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
