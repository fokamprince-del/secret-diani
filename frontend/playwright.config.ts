import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Tests de parcours sur le build de production, mobile d'abord, branché sur l'API factice
 * (`tests/mock-api`, port 3999) : construire avec `npm run build:e2e`. Les parcours marqués
 * `@api` exigent le vrai backend démarré.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'npm run mock-api',
          url: 'http://localhost:3999/api/v1/site/settings',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: 'npm run start',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
