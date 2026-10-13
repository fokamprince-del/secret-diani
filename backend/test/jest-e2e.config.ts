import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: String.raw`test/e2e/.*\.e2e-spec\.ts$`,
  // Paquets publiés uniquement en ESM (dépendances de sanitize-html) : transpilés pour Jest
  // (Node 24 les charge nativement en production).
  transform: {
    [String.raw`^.+\.[tj]s$`]: ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(htmlparser2|domhandler|domutils|dom-serializer|entities|domelementtype)/)',
  ],
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
    '!src/cli/reencrypt-secrets.ts',
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
    './src/catering/': { lines: 80 },
    './src/shop/': { lines: 80 },
    // Exigence du cahier des charges : paiements ≥ 80 %.
    './src/payments/': { lines: 80 },
    // Exigence du cahier des charges : droits d'accès ≥ 80 %.
    './src/courses/': { lines: 80 },
    './src/contact/': { lines: 80 },
    './src/newsletter/': { lines: 80 },
    './src/admin/': { lines: 80 },
    './src/settings/': { lines: 80 },
  },
};

export default config;
