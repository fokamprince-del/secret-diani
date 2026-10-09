import { z } from 'zod';

// Messages de validation de la configuration en français.
z.config(z.locales.fr());

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] })
    .optional()
    .transform((value) => value ?? defaultValue);

const urlList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }),
    CORS_ORIGINS: urlList.optional(),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Sortie lisible via pino-pretty (dépendance de développement) ; JSON sinon.
    LOG_PRETTY: booleanFromEnv(false),

    SENTRY_DSN: z.url().optional(),
    SENTRY_ENVIRONMENT: z.string().min(1).optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

    SWAGGER_ENABLED: booleanFromEnv(false),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/, 'format attendu : 100kb ou 1mb')
      .default('100kb'),
    HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),

    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),

    CATERING_ONLINE_ORDERING: booleanFromEnv(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const origins = env.CORS_ORIGINS ?? [env.PUBLIC_SITE_URL];
    for (const origin of origins) {
      if (!origin.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'en production, toutes les origines doivent être en https',
        });
      }
    }
    if (!env.PUBLIC_SITE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_SITE_URL'],
        message: 'en production, l’URL du site doit être en https',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Valide les variables d'environnement. Le message d'erreur liste les variables
 * fautives sans jamais afficher leur valeur (elles peuvent contenir des secrets).
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || '(racine)';
    const missing = issue.path.length === 1 && raw[String(issue.path[0])] === undefined;
    const reason =
      issue.code === 'invalid_type' && missing ? 'variable obligatoire manquante' : issue.message;
    return `  - ${name} : ${reason}`;
  });
  throw new Error(`Configuration invalide, démarrage annulé :\n${lines.join('\n')}`);
}
