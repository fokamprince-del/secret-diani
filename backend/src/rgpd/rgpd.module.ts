import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RgpdController } from './rgpd.controller';
import { RgpdService } from './rgpd.service';

@Module({
  imports: [AuthModule],
  controllers: [RgpdController],
  providers: [RgpdService],
  exports: [RgpdService],
})
export class RgpdModule {}
