// Lance une commande avec l'API factice démarrée (tests e2e et Lighthouse), puis l'arrête.
// Usage : node scripts/with-mock-api.mjs <commande…>   ex. : node scripts/with-mock-api.mjs npm run build
// Les pages statiques sont générées au build : l'API factice doit déjà répondre à ce moment-là.
import { spawn } from 'node:child_process';

const PORT = process.env.MOCK_API_PORT ?? '3999';
const API_URL = `http://localhost:${PORT}`;
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage : node scripts/with-mock-api.mjs <commande…>');
  process.exit(2);
}

const mock = spawn(process.execPath, ['tests/mock-api/server.mts'], {
  stdio: 'inherit',
  env: { ...process.env, MOCK_API_PORT: PORT },
});

async function waitForMock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/api/v1/site/settings`);
      if (response.ok) return;
    } catch {
      // Pas encore prête.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API factice injoignable sur ${API_URL}`);
}

let code = 1;
try {
  await waitForMock();
  code = await new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, NEXT_PUBLIC_API_URL: API_URL, NEXT_PUBLIC_MEDIA_URL: API_URL },
    });
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
  });
} catch (error) {
  console.error(error.message);
} finally {
  mock.kill();
}
process.exit(code);
