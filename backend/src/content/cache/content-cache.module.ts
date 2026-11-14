import { Global, Module } from '@nestjs/common';
import { ContentCacheService } from './content-cache.service';
import { registerQueue } from '../../jobs/queue-mode';
import { REVALIDATE_QUEUE } from './revalidate.constants';

@Global()
@Module({
  imports: [registerQueue(REVALIDATE_QUEUE)],
  providers: [ContentCacheService],
  exports: [ContentCacheService],
})
export class ContentCacheModule {}
