import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type EnvFileModule = typeof import('./env-file');

/** Importe une copie neuve du module (il s'exécute à l'import), dans un répertoire donné. */
function freshModule(nodeEnv: string, cwd?: string): EnvFileModule {
  const previousCwd = process.cwd();
  process.env.NODE_ENV = nodeEnv;
  if (cwd) process.chdir(cwd);
  try {
    let loaded!: EnvFileModule;
    jest.isolateModules(() => {
      loaded = jest.requireActual<EnvFileModule>('./env-file');
    });
    return loaded;
  } finally {
    process.chdir(previousCwd);
  }
}

describe('env-file', () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  });

  it('choisit le fichier selon NODE_ENV, aucun en production', () => {
    const { envFileFor } = freshModule('production');
    expect(envFileFor('test')).toBe('.env.test');
    expect(envFileFor('development')).toBe('.env');
    expect(envFileFor(undefined)).toBe('.env');
    expect(envFileFor('production')).toBeNull();
  });

  it('charge le fichier de l’environnement courant, sans écraser les variables déjà définies', () => {
    const dir = mkdtempSync(join(tmpdir(), 'diani-env-'));
    writeFileSync(join(dir, '.env.test'), 'AUDIT_FROM_FILE=fichier\nAUDIT_PRESET=fichier\n');
    writeFileSync(join(dir, '.env'), 'AUDIT_DEV_ONLY=dev\n');
    process.env.AUDIT_PRESET = 'conteneur';

    const env = freshModule('test', dir).loadEnvironment();
    expect(env.AUDIT_FROM_FILE).toBe('fichier');
    expect(env.AUDIT_PRESET).toBe('conteneur');
    expect(env.AUDIT_DEV_ONLY).toBeUndefined();
  });

  it('fige l’environnement : une clé ajoutée ensuite à process.env (ex. par Prisma) est ignorée', () => {
    const { loadEnvironment } = freshModule('production');
    process.env.AUDIT_LATE = 'ajoutée après coup';
    expect(loadEnvironment().AUDIT_LATE).toBeUndefined();
    expect(Object.isFrozen(loadEnvironment())).toBe(true);
  });

  it.each(['main.ts', 'worker.ts', 'cli/create-admin.ts'])(
    '%s importe env-file avant tout autre module',
    (entry) => {
      const source = readFileSync(join(__dirname, '..', entry), 'utf8');
      const firstImport = /^import\s+['"][^'"]+['"]|^import\s.+from\s+['"][^'"]+['"]/m.exec(source);
      expect(firstImport?.[0]).toMatch(
        /['"](\.\.?\/)+config\/env-file['"]$|['"]\.\.\/config\/env-file['"]$/,
      );
    },
  );
});
