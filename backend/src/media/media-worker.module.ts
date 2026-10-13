import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MediaProcessingService } from './media-processing.service';
import { MediaProcessor } from './media.processor';
import { MEDIA_QUEUE } from './media.types';

/** Traitement des médias (worker uniquement). */
@Module({
  imports: [BullModule.registerQueue({ name: MEDIA_QUEUE })],
  providers: [MediaProcessingService, MediaProcessor],
  exports: [MediaProcessingService],
})
export class MediaWorkerModule {}
