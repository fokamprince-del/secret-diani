/* eslint-disable no-console -- commande en ligne : la console est son interface. */
// Doit rester le premier import (voir config/env-file.ts).
import '../config/env-file';
import { PrismaClient } from '@prisma/client';
import { FieldEncryptionService } from '../common/crypto/field-encryption.service';
import type { AppConfigService } from '../config/app-config.service';
import { loadEnvironment } from '../config/env-file';
import { type Env, validateEnv } from '../config/env.schema';
import { reencryptSecrets } from './reencrypt-secrets.core';

/**
 * Rechiffrement des secrets 2FA après une rotation de FIELD_ENCRYPTION_KEY.
 *   Développement : make reencrypt-secrets
 *   Production    : make reencrypt-secrets-prod (voir docs/RUNBOOK.md › rotation)
 */
async function main(): Promise<void> {
  const env = validateEnv(loadEnvironment());
  const config = { get: <K extends keyof Env>(key: K) => env[key] } as AppConfigService;
  const prisma = new PrismaClient();
  try {
    const report = await reencryptSecrets(prisma, new FieldEncryptionService(config));
    console.log(
      `Secrets vérifiés : ${report.checked} — rechiffrés : ${report.reencrypted} — illisibles : ${report.failed}`,
    );
    if (report.failed > 0) {
      console.error(
        'Des secrets sont illisibles : ne retirez pas FIELD_ENCRYPTION_KEY_PREVIOUS ; les comptes concernés devront réinitialiser leur 2FA.',
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  // Aucun détail technique (l'URL de la base ou une clé pourraient apparaître dans le message).
  console.error('Échec du rechiffrement (configuration invalide ou base inaccessible ?).');
  process.exitCode = 1;
});
