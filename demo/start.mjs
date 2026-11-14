// Démo en ligne depuis ce poste, via un tunnel Cloudflare gratuit (« quick tunnel »).
// Usage (depuis la racine du dépôt) : node demo/start.mjs        — Ctrl+C arrête tout.
//
// 1. Postgres, Redis et S3 (Docker), base dédiée `diani_demo` migrée et amorcée ;
// 2. tunnel Cloudflare → adresse publique https://…trycloudflare.com (change à chaque lancement) ;
// 3. API + worker NestJS (compilés), site Next.js construit pour cette adresse ;
// 4. proxy local (demo/proxy.mjs) : site, API et médias sous la même origine.
// Secrets facultatifs dans demo/.env.demo (jamais commité) : voir demo/README.md.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const DEMO = join(ROOT, 'demo');
const LOGS = join(DEMO, 'logs');
const STATE_FILE = join(DEMO, '.state.json');
const PROXY_PORT = 8787;
const DEMO_DB =
  'postgresql://diani:diani_dev_password@127.0.0.1:5432/diani_demo?schema=public&connection_limit=10&pool_timeout=10';

mkdirSync(LOGS, { recursive: true });
const secrets = existsSync(join(DEMO, '.env.demo'))
  ? parseEnv(readFileSync(join(DEMO, '.env.demo'), 'utf8'))
  : {};
const children = [];
const isWindows = process.platform === 'win32';

const step = (message) => console.log(`\n▸ ${message}`);

/** Commande bloquante ; arrête tout en cas d'échec. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: isWindows,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    console.error(`\n✖ Échec : ${command} ${args.join(' ')}`);
    shutdown(1);
  }
}

/** Processus de fond, journal dans demo/logs/<nom>.log. */
function background(name, command, args, options = {}) {
  const log = createWriteStream(join(LOGS, `${name}.log`), { flags: 'w' });
  const child = spawn(command, args, {
    shell: isWindows && command !== process.execPath,
    ...options,
    env: { ...process.env, ...options.env },
  });
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  child.on('exit', (code) => {
    if (!stopping) console.error(`\n✖ ${name} s'est arrêté (code ${code}) : voir demo/logs/${name}.log`);
  });
  children.push(child);
  return child;
}

async function waitFor(url, label, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Pas encore prêt.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`✖ ${label} ne répond pas (${url}).`);
  shutdown(1);
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nArrêt de la démo…');
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// --- 1. Infrastructure et base de démo ------------------------------------------------------
step('Postgres, Redis et S3 (Docker)');
run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis', 's3'], { cwd: BACKEND });
spawnSync(
  'docker',
  ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'diani', '-d', 'diani', '-c', 'CREATE DATABASE diani_demo OWNER diani;'],
  { cwd: BACKEND, stdio: 'ignore' },
);
step('Base diani_demo : migrations et données de référence');
run('npx', ['prisma', 'migrate', 'deploy'], { cwd: BACKEND, env: { DATABASE_URL: DEMO_DB } });
run('npx', ['prisma', 'db', 'seed'], { cwd: BACKEND, env: { DATABASE_URL: DEMO_DB } });
// Démo : les pages légales (modèles « [À compléter] ») sont publiées pour que le pied de page
// ne mène nulle part en erreur. En production, Diani les relit avant de les publier.
spawnSync(
  'docker',
  [
    'compose', 'exec', '-T', 'postgres', 'psql', '-U', 'diani', '-d', 'diani_demo', '-c',
    "UPDATE static_pages SET published = true WHERE slug IN ('mentions-legales', 'cgv', 'confidentialite');",
  ],
  { cwd: BACKEND, stdio: 'ignore' },
);

// --- 2. Tunnel Cloudflare --------------------------------------------------------------------
step('Tunnel Cloudflare');
const tunnel = background('tunnel', 'cloudflared', [
  'tunnel',
  '--no-autoupdate',
  '--url',
  `http://127.0.0.1:${PROXY_PORT}`,
]);
const publicUrl = await new Promise((resolveUrl) => {
  const timer = setTimeout(() => {
    console.error('✖ Pas d’adresse de tunnel après 60 s : voir demo/logs/tunnel.log');
    shutdown(1);
  }, 60_000);
  const onData = (chunk) => {
    const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      clearTimeout(timer);
      resolveUrl(match[0]);
    }
  };
  tunnel.stderr.on('data', onData);
  tunnel.stdout.on('data', onData);
});
console.log(`  Adresse publique : ${publicUrl}`);
background('proxy', process.execPath, [join(DEMO, 'proxy.mjs')], {
  env: { DEMO_PROXY_PORT: String(PROXY_PORT) },
});

// --- 3. API et worker --------------------------------------------------------------------------
const googleEnabled = !!(secrets.GOOGLE_CLIENT_ID && secrets.GOOGLE_CLIENT_SECRET);
const revalidateSecret = randomBytes(32).toString('hex');
const apiEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: DEMO_DB,
  PUBLIC_SITE_URL: publicUrl,
  CORS_ORIGINS: publicUrl,
  // Cloudflare puis le proxy local : l'IP réelle du visiteur est deux crans plus loin.
  TRUST_PROXY_HOPS: '2',
  SWAGGER_ENABLED: 'false',
  LOG_PRETTY: 'false',
  LOG_LEVEL: 'info',
  MEDIA_PUBLIC_BASE_URL: `${publicUrl}/s3/diani-public`,
  FRONTEND_REVALIDATE_URL: 'http://127.0.0.1:5173/api/revalidate',
  FRONTEND_REVALIDATE_SECRET: revalidateSecret,
  ...(googleEnabled && {
    GOOGLE_CLIENT_ID: secrets.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: secrets.GOOGLE_CLIENT_SECRET,
  }),
  ...(secrets.RESEND_API_KEY && {
    MAIL_TRANSPORT: 'resend',
    RESEND_API_KEY: secrets.RESEND_API_KEY,
    ...(secrets.MAIL_FROM && { MAIL_FROM: secrets.MAIL_FROM }),
  }),
};
step('Compilation de l’API');
run('npm', ['run', 'build'], { cwd: BACKEND });
background('api', process.execPath, ['dist/main.js'], { cwd: BACKEND, env: apiEnv });
background('worker', process.execPath, ['dist/worker.js'], { cwd: BACKEND, env: apiEnv });
await waitFor('http://127.0.0.1:3000/api/v1/site/settings', 'L’API');
console.log('  API prête.');

// --- 4. Site Next.js -----------------------------------------------------------------------------
const siteEnv = {
  NEXT_PUBLIC_SITE_URL: publicUrl,
  NEXT_PUBLIC_API_URL: publicUrl,
  NEXT_PUBLIC_MEDIA_URL: `${publicUrl}/s3`,
  // Bouton toujours visible dans la démo : sans clés, l'API renvoie « momentanément indisponible ».
  NEXT_PUBLIC_GOOGLE_AUTH: 'true',
  API_INTERNAL_URL: 'http://127.0.0.1:3000',
  REVALIDATE_SECRET: revalidateSecret,
};
// Les variables NEXT_PUBLIC_* sont figées au build : reconstruire si l'adresse a changé.
const buildKey = JSON.stringify({ publicUrl, googleEnabled });
const buildIdFile = join(FRONTEND, '.next', 'BUILD_ID');
const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
const currentBuild = existsSync(buildIdFile) ? readFileSync(buildIdFile, 'utf8') : null;
if (state.buildKey === buildKey && state.buildId === currentBuild && currentBuild) {
  step('Site déjà construit pour cette adresse');
} else {
  step('Construction du site pour cette adresse (2 à 4 minutes)');
  run('npm', ['run', 'build'], { cwd: FRONTEND, env: siteEnv });
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ buildKey, buildId: readFileSync(buildIdFile, 'utf8') }, null, 2),
  );
}
background('site', process.execPath, ['scripts/start.mjs'], {
  cwd: FRONTEND,
  env: { ...siteEnv, PORT: '5173', HOSTNAME: '127.0.0.1' },
});
await waitFor('http://127.0.0.1:5173/', 'Le site');

console.log(`
══════════════════════════════════════════════════════════════════
  Démo en ligne : ${publicUrl}
  Connexion Google : ${googleEnabled ? 'activée' : 'désactivée (pas de clés dans demo/.env.demo)'}${
    googleEnabled
      ? `\n  URI de redirection à déclarer chez Google :\n    ${publicUrl}/api/v1/auth/google/callback`
      : ''
  }
  E-mails : ${secrets.RESEND_API_KEY ? 'envoyés par Resend' : 'non envoyés (écrits dans backend/tmp/mails)'}
  Journaux : demo/logs/        Ctrl+C pour tout arrêter
══════════════════════════════════════════════════════════════════`);
