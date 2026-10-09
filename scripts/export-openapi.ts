/**
 * Exporte la spécification OpenAPI dans docs/openapi.json (sans base ni Redis :
 * les connexions sont paresseuses et aucune requête n'est émise).
 * Usage : npm run openapi:export
 */
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const placeholders: Record<string, string> = {
  NODE_ENV: 'development',
  PUBLIC_SITE_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://export:export@127.0.0.1:1/export',
  REDIS_URL: 'redis://127.0.0.1:1',
  LOG_LEVEL: 'silent',
  SWAGGER_ENABLED: 'false',
};
for (const [key, value] of Object.entries(placeholders)) process.env[key] = value;

async function main(): Promise<void> {
  // Imports après la préparation de l'environnement (la configuration est lue au chargement).
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/bootstrap');
  const { createOpenApiDocument } = await import('../src/swagger');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: false,
  });
  configureApp(app);
  await app.init();

  const document = createOpenApiDocument(app);
  const target = join(__dirname, '..', 'docs', 'openapi.json');
  mkdirSync(join(__dirname, '..', 'docs'), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`Spécification OpenAPI écrite dans ${target}`);
}

main().catch((error: unknown) => {
  console.error('Échec de l’export OpenAPI :', error);
  process.exit(1);
});
