import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service';
import { createPinoHttpOptions } from './pino-options';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: createPinoHttpOptions({
          level: config.get('LOG_LEVEL'),
          pretty: config.get('LOG_PRETTY'),
        }),
      }),
    }),
  ],
})
export class LoggingModule {}
