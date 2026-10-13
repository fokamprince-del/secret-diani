import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from './common/errors/error-response';

export const SWAGGER_PATH = 'api/docs';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('API Les Secrets de Diani')
    .setDescription(
      'API REST du site « Les Secrets de Diani » : traiteur, formations, boutique et contenus. ' +
        'Toutes les erreurs suivent le format `ErrorResponseDto` avec un message en français.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('diani_rt', { type: 'apiKey', in: 'cookie', name: 'diani_rt' }, 'diani_rt')
    .build();
  return SwaggerModule.createDocument(app, config, { extraModels: [ErrorResponseDto] });
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: `${SWAGGER_PATH}/openapi.json`,
    customSiteTitle: 'API Les Secrets de Diani',
  });
}
