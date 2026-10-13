import type { PrismaClient } from '@prisma/client';
import type { FieldEncryptionService } from '../common/crypto/field-encryption.service';

export interface ReencryptionReport {
  checked: number;
  reencrypted: number;
  /** Valeurs illisibles avec les clés fournies (clé précédente déjà retirée ?). */
  failed: number;
}

const BATCH = 200;

/**
 * Rotation de FIELD_ENCRYPTION_KEY : rechiffre avec la clé courante les secrets 2FA encore
 * chiffrés avec l'ancienne. Idempotent (une valeur déjà à jour n'est pas réécrite) et sûr
 * en concurrence (mise à jour conditionnée à la valeur lue). Une fois le rapport à 0 échec,
 * FIELD_ENCRYPTION_KEY_PREVIOUS peut être retirée (voir RUNBOOK › rotation).
 */
export async function reencryptSecrets(
  prisma: PrismaClient,
  encryption: FieldEncryptionService,
): Promise<ReencryptionReport> {
  const report: ReencryptionReport = { checked: 0, reencrypted: 0, failed: 0 };
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where: { totpSecretEnc: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true, totpSecretEnc: true },
    });
    if (users.length === 0) return report;
    cursor = users.at(-1)!.id;
    for (const user of users) {
      const current = user.totpSecretEnc!;
      report.checked += 1;
      if (!encryption.needsReencryption(current)) continue;
      let plaintext: string;
      try {
        plaintext = encryption.decrypt(current);
      } catch {
        report.failed += 1;
        continue;
      }
      const updated = await prisma.user.updateMany({
        where: { id: user.id, totpSecretEnc: current },
        data: { totpSecretEnc: encryption.encrypt(plaintext) },
      });
      report.reencrypted += updated.count;
    }
  }
}
