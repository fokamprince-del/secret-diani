import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { registerQueue } from '../jobs/queue-mode';
import { MEDIA_QUEUE } from './media.types';

/** Médiathèque côté API (envoi, liste, suppression). Le traitement est dans MediaWorkerModule. */
@Module({
  imports: [registerQueue(MEDIA_QUEUE)],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
