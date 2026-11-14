import { Module } from '@nestjs/common';
import { MediaProcessingService } from './media-processing.service';
import { MediaProcessor } from './media.processor';
import { registerQueue } from '../jobs/queue-mode';
import { MEDIA_QUEUE } from './media.types';

/** Traitement des médias (worker uniquement). */
@Module({
  imports: [registerQueue(MEDIA_QUEUE)],
  providers: [MediaProcessingService, MediaProcessor],
  exports: [MediaProcessingService],
})
export class MediaWorkerModule {}
