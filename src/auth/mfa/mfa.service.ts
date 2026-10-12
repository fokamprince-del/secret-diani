import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { hkdfSync, randomInt } from 'node:crypto';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { hmacSha256Hex, randomToken, sha256Hex } from '../../common/crypto/hash';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  MFA_BACKUP_CODE_COUNT,
  MFA_CHALLENGE_MAX_ATTEMPTS,
  MFA_CHALLENGE_TTL_MS,
  MFA_ISSUER,
} from '../auth.constants';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp';

export type ChallengePurpose = 'verify' | 'enroll';

interface Challenge {
  userId: string;
  purpose: ChallengePurpose;
  /** Secret en cours d'enrôlement, chiffré (jamais en clair dans Redis). */
  pendingSecretEnc?: string;
}

/** Alphabet sans caractères ambigus (0/o, 1/l/i) : 31 symboles, 10 caractères ≈ 49 bits. */
const BACKUP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export type MfaVerification =
  | { ok: true; userId: string; usedBackupCode: boolean }
  | { ok: false; userId: string; exhausted: boolean };

export function mfaError(
  message = 'Code invalide. Vérifiez l’heure de votre téléphone et réessayez.',
): AppException {
  return new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.MFA_INVALID, message);
}

export const tooManyCodes = (): AppException =>
  mfaError('Trop de codes invalides. Merci de vous reconnecter.');

const challengeExpired = (): AppException =>
  mfaError('Votre vérification a expiré. Merci de vous reconnecter.');

export function normalizeBackupCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, '');
}

/**
 * Second facteur des administrateurs : TOTP (secret chiffré au repos) + codes de secours.
 * Entre le mot de passe et le code, un défi court (5 min, 5 essais) est conservé dans Redis.
 */
@Injectable()
export class MfaService {
  /** Clés HMAC des codes de secours, dérivées des clés de chiffrement (courante en premier). */
  private readonly backupKeys: Buffer[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: FieldEncryptionService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.backupKeys = encryption.rawKeys.map((key) =>
      Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'diani-mfa-backup-codes', 32)),
    );
  }

  private challengeKey(mfaToken: string): string {
    return `auth:mfa:${sha256Hex(mfaToken)}`;
  }

  async createChallenge(userId: string, purpose: ChallengePurpose): Promise<string> {
    const mfaToken = randomToken();
    const challenge: Challenge = { userId, purpose };
    await this.redis.set(
      this.challengeKey(mfaToken),
      JSON.stringify(challenge),
      'PX',
      MFA_CHALLENGE_TTL_MS,
    );
    return mfaToken;
  }

  private async readChallenge(mfaToken: string, purpose: ChallengePurpose): Promise<Challenge> {
    const raw = await this.redis.get(this.challengeKey(mfaToken));
    if (!raw) throw challengeExpired();
    const challenge = JSON.parse(raw) as Challenge;
    if (challenge.purpose !== purpose) throw challengeExpired();
    return challenge;
  }

  /** Compte un essai raté ; au-delà de la limite, le défi est détruit (retour au mot de passe). */
  private async recordFailedAttempt(mfaToken: string): Promise<boolean> {
    const key = this.challengeKey(mfaToken);
    const attempts = await this.redis.incr(`${key}:attempts`);
    if (attempts === 1) await this.redis.pexpire(`${key}:attempts`, MFA_CHALLENGE_TTL_MS);
    if (attempts < MFA_CHALLENGE_MAX_ATTEMPTS) return false;
    await this.redis.del(key, `${key}:attempts`);
    return true;
  }

  private async destroyChallenge(mfaToken: string): Promise<void> {
    const key = this.challengeKey(mfaToken);
    await this.redis.del(key, `${key}:attempts`);
  }

  /** Première connexion d'un administrateur : génère le secret à enregistrer dans l'application. */
  async startEnrollment(
    mfaToken: string,
    accountLabel: string,
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const key = this.challengeKey(mfaToken);
    const challenge = await this.readChallenge(mfaToken, 'enroll');
    const secret = generateTotpSecret();
    challenge.pendingSecretEnc = this.encryption.encrypt(secret);
    await this.redis.set(key, JSON.stringify(challenge), 'KEEPTTL');
    return { secret, otpauthUrl: otpauthUri(secret, accountLabel, MFA_ISSUER) };
  }

  /** Valide le premier code, active le second facteur et remet les codes de secours. */
  async confirmEnrollment(
    mfaToken: string,
    code: string,
  ): Promise<{ userId: string; backupCodes: string[] }> {
    const challenge = await this.readChallenge(mfaToken, 'enroll');
    if (!challenge.pendingSecretEnc) {
      throw mfaError('Commencez par générer le secret de votre application d’authentification.');
    }
    const secret = this.encryption.decrypt(challenge.pendingSecretEnc);
    const step = verifyTotp(secret, code);
    if (step === null) {
      const exhausted = await this.recordFailedAttempt(mfaToken);
      throw exhausted ? tooManyCodes() : mfaError();
    }

    const backupCodes = this.generateBackupCodes();
    const enrolled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: challenge.userId, totpEnabledAt: null, status: 'active' },
        data: {
          totpSecretEnc: challenge.pendingSecretEnc,
          totpEnabledAt: new Date(),
          totpLastStep: step,
        },
      });
      if (updated.count !== 1) return false;
      await tx.mfaBackupCode.deleteMany({ where: { userId: challenge.userId } });
      await tx.mfaBackupCode.createMany({
        data: backupCodes.map((backupCode) => ({
          userId: challenge.userId,
          codeHash: this.hashBackupCode(backupCode, 0),
        })),
      });
      return true;
    });
    await this.destroyChallenge(mfaToken);
    if (!enrolled) throw challengeExpired();
    return { userId: challenge.userId, backupCodes };
  }

  /**
   * Vérifie un code TOTP (anti-rejeu) ou un code de secours (usage unique).
   * Un échec est compté sur le défi ; le défi est détruit après le dernier essai autorisé.
   */
  async verifyChallenge(
    mfaToken: string,
    proof: { code?: string; backupCode?: string },
  ): Promise<MfaVerification> {
    const challenge = await this.readChallenge(mfaToken, 'verify');
    const ok = proof.backupCode
      ? await this.consumeBackupCode(challenge.userId, proof.backupCode)
      : proof.code
        ? await this.consumeTotp(challenge.userId, proof.code)
        : false;
    if (!ok) {
      const exhausted = await this.recordFailedAttempt(mfaToken);
      return { ok: false, userId: challenge.userId, exhausted };
    }
    await this.destroyChallenge(mfaToken);
    return { ok: true, userId: challenge.userId, usedBackupCode: Boolean(proof.backupCode) };
  }

  /** Remplace les codes de secours (code TOTP courant exigé). */
  async regenerateBackupCodes(userId: string, code: string): Promise<string[] | null> {
    if (!(await this.consumeTotp(userId, code))) return null;
    const backupCodes = this.generateBackupCodes();
    await this.prisma.$transaction([
      this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
      this.prisma.mfaBackupCode.createMany({
        data: backupCodes.map((backupCode) => ({
          userId,
          codeHash: this.hashBackupCode(backupCode, 0),
        })),
      }),
    ]);
    return backupCodes;
  }

  /**
   * Accepte un code TOTP une seule fois : le pas accepté doit être strictement postérieur
   * au dernier pas utilisé (mise à jour conditionnelle atomique).
   */
  async consumeTotp(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecretEnc: true },
    });
    if (!user?.totpSecretEnc) return false;
    const step = verifyTotp(this.encryption.decrypt(user.totpSecretEnc), code);
    if (step === null) return false;
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return updated.count === 1;
  }

  private async consumeBackupCode(userId: string, backupCode: string): Promise<boolean> {
    const hashes = this.backupKeys.map((_, index) => this.hashBackupCode(backupCode, index));
    const updated = await this.prisma.mfaBackupCode.updateMany({
      where: { userId, codeHash: { in: hashes }, usedAt: null },
      data: { usedAt: new Date() },
    });
    return updated.count > 0;
  }

  private hashBackupCode(code: string, keyIndex: number): string {
    return hmacSha256Hex(this.backupKeys[keyIndex]!, normalizeBackupCode(code));
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: MFA_BACKUP_CODE_COUNT }, () => {
      const chars = Array.from(
        { length: 10 },
        () => BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)],
      ).join('');
      return `${chars.slice(0, 5)}-${chars.slice(5)}`;
    });
  }
}
