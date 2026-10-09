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
  ],
  coverageDirectory: '../coverage/unit',
  // Seuils renforcés (≥ 80 %) appliqués aux modules auth, paiements et droits d'accès dès leur phase.
  coverageThreshold: { global: { lines: 80, branches: 70 } },
};

export default config;
