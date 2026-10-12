import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ContentCacheService } from './content-cache.service';
import { REVALIDATE_QUEUE } from './revalidate.constants';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: REVALIDATE_QUEUE })],
  providers: [ContentCacheService],
  exports: [ContentCacheService],
})
export class ContentCacheModule {}
