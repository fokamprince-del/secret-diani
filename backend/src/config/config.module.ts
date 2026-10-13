import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { loadEnvironment } from './env-file';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      // Le fichier d'environnement est chargé par ./env-file, avant tout import tiers ; la
      // validation porte sur l'environnement figé à ce moment-là, pas sur process.env.
      ignoreEnvFile: true,
      validate: () => validateEnv(loadEnvironment()),
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
