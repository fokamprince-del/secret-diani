import { validateEnv } from './env.schema';

const base = {
  PUBLIC_SITE_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://user:SuperSecret123@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: 'minio',
  S3_SECRET_ACCESS_KEY: 'minio-secret',
  S3_BUCKET_PRIVATE: 'diani-private',
  S3_BUCKET_PUBLIC: 'diani-public',
  MEDIA_PUBLIC_BASE_URL: 'http://localhost:9000/diani-public',
};

const production = {
  ...base,
  NODE_ENV: 'production',
  PUBLIC_SITE_URL: 'https://a.fr',
  MAIL_TRANSPORT: 'resend',
  RESEND_API_KEY: 're_test_0123456789',
};

describe('validateEnv', () => {
  it('applique les valeurs par défaut sûres', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.CATERING_ONLINE_ORDERING).toBe(false);
    expect(env.BODY_LIMIT).toBe('100kb');
  });

  it('refuse de démarrer si une variable obligatoire manque, sans afficher de valeur', () => {
    const { DATABASE_URL: _omitted, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL : variable obligatoire manquante/);
    try {
      validateEnv({ ...rest, REDIS_URL: 'pas-une-url' });
    } catch (error) {
      expect((error as Error).message).not.toContain('SuperSecret123');
      expect((error as Error).message).not.toContain('pas-une-url');
    }
  });

  it('refuse une URL de base de données d’un autre protocole', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('interprète les booléens explicitement', () => {
    expect(validateEnv({ ...base, SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
    expect(validateEnv({ ...base, SWAGGER_ENABLED: '0' }).SWAGGER_ENABLED).toBe(false);
    expect(() => validateEnv({ ...base, SWAGGER_ENABLED: 'peut-être' })).toThrow(/SWAGGER_ENABLED/);
  });

  it('découpe la liste des origines CORS', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: 'https://a.fr, https://www.a.fr',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.fr', 'https://www.a.fr']);
  });

  it('exige https pour le site et les origines CORS en production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/PUBLIC_SITE_URL/);
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        PUBLIC_SITE_URL: 'https://a.fr',
        CORS_ORIGINS: 'http://a.fr',
      }),
    ).toThrow(/CORS_ORIGINS/);
    expect(validateEnv(production).NODE_ENV).toBe('production');
  });

  it('exige des secrets d’authentification robustes', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'court' })).toThrow(
      /JWT_ACCESS_SECRET : doit contenir au moins 32 caractères/,
    );
    expect(() =>
      validateEnv({ ...base, FIELD_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/FIELD_ENCRYPTION_KEY/);
    expect(() =>
      validateEnv({ ...base, JWT_ACCESS_SECRET_PREVIOUS: base.JWT_ACCESS_SECRET }),
    ).toThrow(/JWT_ACCESS_SECRET_PREVIOUS : doit différer/);
  });

  it('impose Resend (avec sa clé) en production', () => {
    expect(() => validateEnv({ ...production, MAIL_TRANSPORT: 'outbox' })).toThrow(
      /MAIL_TRANSPORT/,
    );
    const { RESEND_API_KEY: _key, ...withoutKey } = production;
    expect(() => validateEnv(withoutKey)).toThrow(/RESEND_API_KEY/);
    expect(validateEnv(base).MAIL_TRANSPORT).toBe('outbox');
  });

  it('interdit la création automatique des buckets en production', () => {
    expect(() => validateEnv({ ...production, S3_AUTO_CREATE_BUCKETS: 'true' })).toThrow(
      /S3_AUTO_CREATE_BUCKETS/,
    );
    expect(validateEnv(base).S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('interdit la documentation Swagger en production', () => {
    expect(() => validateEnv({ ...production, SWAGGER_ENABLED: 'true' })).toThrow(
      /SWAGGER_ENABLED/,
    );
    expect(validateEnv({ ...production, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
  });

  it('exige le secret de revalidation avec l’URL du frontend', () => {
    expect(() =>
      validateEnv({ ...base, FRONTEND_REVALIDATE_URL: 'https://site.fr/api/revalidate' }),
    ).toThrow(/FRONTEND_REVALIDATE_SECRET/);
  });
});
