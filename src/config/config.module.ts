import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.schema';

const nodeEnv = process.env.NODE_ENV ?? 'development';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      validate: validateEnv,
      // En production, la configuration vient exclusivement de l'environnement du conteneur.
      ignoreEnvFile: nodeEnv === 'production',
      envFilePath: nodeEnv === 'test' ? '.env.test' : '.env',
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
