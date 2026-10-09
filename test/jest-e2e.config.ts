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
  ],
  coverageDirectory: '<rootDir>/coverage/e2e',
};

export default config;
