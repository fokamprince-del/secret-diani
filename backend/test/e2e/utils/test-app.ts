import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { configureApp } from '../../../src/bootstrap';

/**
 * Démarre l'application réelle (AppModule + configureApp, comme main.ts),
 * avec éventuellement des contrôleurs de test supplémentaires et des fournisseurs remplacés
 * (ex. faux prestataires de paiement).
 */
export async function createTestApp(
  extraControllers: Type[] = [],
  overrides: { provide: unknown; useValue: unknown }[] = [],
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule], controllers: extraControllers });
  for (const override of overrides) {
    builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();
  return app;
}
