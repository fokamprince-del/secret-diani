import './instrument';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app);

  const config = app.get(AppConfigService);
  const server = await app.listen(config.get('PORT'), '0.0.0.0');

  // Protection contre les connexions lentes (slowloris) et les requêtes interminables.
  server.headersTimeout = 15_000;
  server.requestTimeout = config.get('HTTP_REQUEST_TIMEOUT_MS') + 5_000;
  server.keepAliveTimeout = 65_000;
}

void bootstrap();
