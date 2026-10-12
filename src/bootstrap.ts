import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfigService } from './config/app-config.service';
import { SWAGGER_PATH, setupSwagger } from './swagger';

export const API_PREFIX = 'api/v1';

const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Anti-pollution de prototype : un corps JSON contenant ces clés est refusé (400) dès l'analyse,
 * avant que class-transformer ne puisse les affecter à un DTO.
 */
function rejectPrototypeKeys(key: string, value: unknown): unknown {
  if (FORBIDDEN_JSON_KEYS.has(key)) throw new SyntaxError('Clé JSON interdite');
  return value;
}

/**
 * Configuration HTTP partagée entre `main.ts` et les tests e2e
 * (les tests vérifient ainsi exactement ce qui tourne en production).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Nombre de proxys de confiance (Cloudflare + Traefik) pour obtenir la vraie IP client.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS'));
  app.disable('x-powered-by');

  const strictHelmet = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    },
    strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  // Swagger UI (désactivé par défaut en production) doit pouvoir charger ses propres scripts.
  const docsHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(`/${SWAGGER_PATH}`)
      ? docsHelmet(req, res, next)
      : strictHelmet(req, res, next),
  );

  const allowedOrigins = new Set(config.corsOrigins.map((origin) => origin.replace(/\/$/, '')));
  app.enableCors({
    // Requêtes sans en-tête Origin (serveur à serveur, sondes) : pas d'en-têtes CORS nécessaires.
    origin: (origin, callback) =>
      callback(null, origin !== undefined && allowedOrigins.has(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });

  const bodyLimit = config.get('BODY_LIMIT');
  app.useBodyParser('json', { limit: bodyLimit, strict: true, reviver: rejectPrototypeKeys });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: false, parameterLimit: 100 });
  // Cookies non signés : le refresh token est un jeton opaque vérifié en base.
  app.use(cookieParser());

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
      { path: 'robots.txt', method: RequestMethod.GET },
    ],
  });

  if (config.get('SWAGGER_ENABLED')) setupSwagger(app);
}
