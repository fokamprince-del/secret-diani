import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: String.raw`test/e2e/.*\.e2e-spec\.ts$`,
  transform: { [String.raw`^.+\.ts$`]: ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/e2e/global-setup.ts',
  setupFiles: ['<rootDir>/test/e2e/load-env.ts'],
  testTimeout: 30_000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/worker.ts',
    '!src/worker-healthcheck.ts',
    '!src/cli/create-admin.ts',
  ],
  coverageDirectory: '<rootDir>/coverage/e2e',
  // Exigence du cahier des charges : couverture ≥ 80 % sur l'authentification et les comptes
  // (puis paiements et droits d'accès dans leurs phases). Appliquée quand --coverage est actif (CI).
  coverageThreshold: {
    global: {},
    './src/auth/': { lines: 80 },
    './src/sessions/': { lines: 80 },
    './src/users/': { lines: 80 },
    './src/rgpd/': { lines: 80 },
  },
};

export default config;
