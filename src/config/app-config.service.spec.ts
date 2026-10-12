import type { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { type Env, validateEnv } from './env.schema';

function createService(raw: Record<string, string>): AppConfigService {
  const env = validateEnv({
    PUBLIC_SITE_URL: 'https://lessecretsdediani.fr',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    MAIL_TRANSPORT: 'resend',
    RESEND_API_KEY: 're_test_0123456789',
    ...raw,
  });
  const config = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
  return new AppConfigService(config);
}

describe('AppConfigService', () => {
  it('utilise l’URL du site comme origine CORS par défaut', () => {
    expect(createService({}).corsOrigins).toEqual(['https://lessecretsdediani.fr']);
  });

  it('utilise la liste explicite quand elle est fournie', () => {
    expect(createService({ CORS_ORIGINS: 'https://a.fr,https://b.fr' }).corsOrigins).toEqual([
      'https://a.fr',
      'https://b.fr',
    ]);
  });

  it('indique le mode production', () => {
    expect(createService({ NODE_ENV: 'production' }).isProduction).toBe(true);
    expect(createService({}).isProduction).toBe(false);
  });
});
