import { validateEnv } from './env.schema';

const base = {
  PUBLIC_SITE_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://user:SuperSecret123@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
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
    expect(
      validateEnv({ ...base, NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://a.fr' }).NODE_ENV,
    ).toBe('production');
  });
});
