import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: String.raw`\.spec\.ts$`,
  transform: { [String.raw`^.+\.ts$`]: ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  testEnvironment: 'node',
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.module.ts',
    '!main.ts',
    '!worker.ts',
    '!worker-healthcheck.ts',
    '!instrument.ts',
    // Code d'assemblage couvert par les tests e2e (application réelle, base et Redis réels).
    '!bootstrap.ts',
    '!swagger.ts',
    '!**/*.controller.ts',
    '!prisma/prisma.service.ts',
    '!common/throttler/redis-throttler.storage.ts',
    '!common/errors/error-response.ts',
    // Services adossés à Postgres/Redis : couverts par les tests e2e (seuils dans test/jest-e2e.config.ts).
    '!auth/auth.service.ts',
    '!auth/login-attempts.service.ts',
    '!auth/mfa/mfa.service.ts',
    '!auth/tokens/user-tokens.service.ts',
    '!auth/password/password.service.ts',
    '!sessions/sessions.service.ts',
    '!users/*.service.ts',
    '!rgpd/rgpd.service.ts',
    '!audit/audit.service.ts',
    '!mail/mail.service.ts',
    '!mail/mail.processor.ts',
    '!mail/transports/outbox.transport.ts',
    '!jobs/retention/*.ts',
    '!cli/**',
    '!**/dto/**',
  ],
  coverageDirectory: '../coverage/unit',
  coverageThreshold: { global: { lines: 80, branches: 70 } },
};

export default config;
