import react from '@vitejs/plugin-react';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${root}/$1` },
      // `server-only` lève une erreur hors du bundle serveur de Next : neutralisé en test.
      { find: 'server-only', replacement: `${root}/tests/stubs/empty.ts` },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'components/**', 'app/**'],
      exclude: ['lib/api/schema.d.ts'],
    },
  },
});
