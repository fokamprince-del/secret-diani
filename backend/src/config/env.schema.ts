import { z } from 'zod';

// Messages de validation de la configuration en français.
z.config(z.locales.fr());

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] })
    .optional()
    .transform((value) => value ?? defaultValue);

/** Clé de 32 octets encodée en base64 (générer avec `openssl rand -base64 32`). */
const base64Key = z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
  message: 'doit être une clé de 32 octets encodée en base64 (openssl rand -base64 32)',
});

const jwtSecret = z.string().min(32, 'doit contenir au moins 32 caractères');

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
    // URL publique de l'API (ex. https://api.lessecretsdediani.fr), sans /api/v1 : liens
    // « désinscription en un clic » des e-mails (RFC 8058). Facultative.
    PUBLIC_API_URL: z.url({ protocol: /^https?$/ }).optional(),
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

    // --- Paiements (phase 6) : chaque prestataire est facultatif, au moins un en production ---
    STRIPE_SECRET_KEY: z
      .string()
      .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/, 'clé secrète Stripe attendue (sk_… ou rk_…)')
      .optional(),
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .regex(/^whsec_[A-Za-z0-9]+$/, 'secret de signature des webhooks Stripe attendu (whsec_…)')
      .optional(),
    PAYPAL_CLIENT_ID: z.string().min(10).optional(),
    PAYPAL_CLIENT_SECRET: z.string().min(10).optional(),
    PAYPAL_WEBHOOK_ID: z.string().min(5).optional(),
    PAYPAL_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),
    // Adresses autorisées à appeler les webhooks (IP ou CIDR, séparées par des virgules).
    // Vide : seules les signatures font foi (elles sont toujours vérifiées).
    WEBHOOK_ALLOWED_IPS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      )
      .optional(),

    // --- Vidéos des formations : Bunny Stream (phase 7) ---
    // Nom d'hôte de la zone de diffusion (ex. vz-1234abcd-567.b-cdn.net) et clé
    // d'authentification par jeton de cette zone. Sans eux, les leçons n'ont pas de vidéo.
    BUNNY_STREAM_CDN_HOST: z
      .string()
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'nom d’hôte attendu (ex. vz-1234abcd-567.b-cdn.net)')
      .optional(),
    BUNNY_STREAM_TOKEN_KEY: z.string().min(16).optional(),
    // Lier l'URL signée à l'IP de la cliente (plus strict, mais coupe la lecture si l'IP change).
    BUNNY_STREAM_BIND_IP: booleanFromEnv(false),

    // --- Anti-robot des formulaires publics (Cloudflare Turnstile) ---
    // Sans clé (développement, tests), la vérification est ignorée ; obligatoire en production.
    TURNSTILE_SECRET_KEY: z.string().min(10).optional(),

    // --- Authentification (phase 2) ---
    JWT_ACCESS_SECRET: jwtSecret,
    // Ancien secret, accepté en vérification seulement pendant une rotation (voir RUNBOOK).
    JWT_ACCESS_SECRET_PREVIOUS: jwtSecret.optional(),
    FIELD_ENCRYPTION_KEY: base64Key,
    FIELD_ENCRYPTION_KEY_PREVIOUS: base64Key.optional(),
    // Version des CGU/politique de confidentialité acceptée à l'inscription.
    TERMS_VERSION: z.string().min(1).max(20).default('2026-10'),

    // --- E-mails ---
    // resend : envoi réel ; outbox : écriture des e-mails dans MAIL_OUTBOX_DIR (développement).
    MAIL_TRANSPORT: z.enum(['resend', 'outbox']).default('outbox'),
    MAIL_FROM: z.string().min(3).default('Les Secrets de Diani <ne-pas-repondre@localhost>'),
    MAIL_REPLY_TO: z.email().optional(),
    RESEND_API_KEY: z.string().min(10).optional(),
    MAIL_OUTBOX_DIR: z.string().min(1).default('tmp/mails'),

    // --- Stockage objets compatible S3 (OVH Object Storage ; MinIO en local) ---
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
    S3_REGION: z.string().min(1).default('gra'),
    S3_ACCESS_KEY_ID: z.string().min(3),
    S3_SECRET_ACCESS_KEY: z.string().min(8),
    // Originaux et documents (accès par URL signée uniquement).
    S3_BUCKET_PRIVATE: z.string().min(3),
    // Variantes d'images publiques (servies par le CDN).
    S3_BUCKET_PUBLIC: z.string().min(3),
    S3_FORCE_PATH_STYLE: booleanFromEnv(true),
    // Développement et tests uniquement : crée les buckets au démarrage.
    S3_AUTO_CREATE_BUCKETS: booleanFromEnv(false),
    // URL publique du bucket public (ou du CDN devant lui), sans barre finale.
    MEDIA_PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }),

    // --- Antivirus (facultatif) : démon clamd joignable en TCP ---
    CLAMAV_HOST: z.string().min(1).optional(),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),

    // --- Revalidation du frontend (ISR) après une modification de contenu ---
    FRONTEND_REVALIDATE_URL: z.url({ protocol: /^https?$/ }).optional(),
    FRONTEND_REVALIDATE_SECRET: z.string().min(32).optional(),
    // Durée du cache Redis des contenus publics.
    CONTENT_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86400).default(300),
  })
  .superRefine((env, ctx) => {
    if (env.FRONTEND_REVALIDATE_URL && !env.FRONTEND_REVALIDATE_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['FRONTEND_REVALIDATE_SECRET'],
        message: 'obligatoire quand FRONTEND_REVALIDATE_URL est défini',
      });
    }
    if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'obligatoire quand MAIL_TRANSPORT=resend',
      });
    }
    if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.STRIPE_SECRET_KEY ? 'STRIPE_WEBHOOK_SECRET' : 'STRIPE_SECRET_KEY'],
        message: 'Stripe exige la clé secrète ET le secret des webhooks',
      });
    }
    const paypal = [env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET, env.PAYPAL_WEBHOOK_ID];
    if (paypal.some(Boolean) && !paypal.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYPAL_CLIENT_ID'],
        message:
          'PayPal exige PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET et PAYPAL_WEBHOOK_ID ensemble',
      });
    }
    if (Boolean(env.BUNNY_STREAM_CDN_HOST) !== Boolean(env.BUNNY_STREAM_TOKEN_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['BUNNY_STREAM_TOKEN_KEY'],
        message: 'Bunny Stream exige l’hôte de diffusion ET la clé de jeton',
      });
    }
    if (env.JWT_ACCESS_SECRET_PREVIOUS === env.JWT_ACCESS_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET_PREVIOUS'],
        message: 'doit différer du secret courant',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    if (env.S3_AUTO_CREATE_BUCKETS) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_AUTO_CREATE_BUCKETS'],
        message: 'interdit en production (buckets créés et configurés manuellement, voir RUNBOOK)',
      });
    }
    if (env.SWAGGER_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['SWAGGER_ENABLED'],
        message: 'interdit en production (la spécification est publiée dans docs/openapi.json)',
      });
    }
    if (!env.STRIPE_SECRET_KEY && !env.PAYPAL_CLIENT_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'en production, au moins un moyen de paiement (Stripe ou PayPal) est requis',
      });
    }
    if (!env.TURNSTILE_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURNSTILE_SECRET_KEY'],
        message: 'obligatoire en production (anti-robot des formulaires publics)',
      });
    }
    if (env.MAIL_TRANSPORT !== 'resend') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_TRANSPORT'],
        message: 'en production, les e-mails doivent partir par Resend',
      });
    }
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
