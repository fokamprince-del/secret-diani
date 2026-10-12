import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { UserTokenPurpose } from '@prisma/client';
import type Redis from 'ioredis';
import { randomToken, sha256Hex } from '../../common/crypto/hash';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { EMAIL_SEND_LIMIT } from '../auth.constants';

export function invalidTokenError(): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.INVALID_TOKEN,
    'Ce lien est invalide ou a expiré. Merci de refaire une demande.',
  );
}

/**
 * Jetons à usage unique envoyés par e-mail : aléatoires (256 bits), seule leur empreinte
 * SHA-256 est stockée, durée de vie courte, consommation atomique.
 */
@Injectable()
export class UserTokensService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Émet un jeton ; les jetons encore valides du même usage sont invalidés. */
  async issue(
    userId: string,
    purpose: UserTokenPurpose,
    ttlMs: number,
    newEmail?: string,
  ): Promise<string> {
    const token = randomToken();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.userToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.userToken.create({
        data: {
          userId,
          purpose,
          tokenHash: sha256Hex(token),
          newEmail: newEmail ?? null,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      }),
    ]);
    return token;
  }

  /** Consomme un jeton (une seule fois, même sous requêtes concurrentes). */
  async consume(
    token: string,
    purpose: UserTokenPurpose,
  ): Promise<{ userId: string; newEmail: string | null }> {
    const tokenHash = sha256Hex(token);
    const claimed = await this.prisma.userToken.updateMany({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalidTokenError();
    return this.prisma.userToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { userId: true, newEmail: true },
    });
  }

  /**
   * Limite les e-mails envoyés à une même adresse pour un même usage (anti-harcèlement, anti-coût).
   * Au-delà, la demande est ignorée silencieusement (la réponse HTTP reste identique).
   */
  async allowEmailSend(purpose: string, email: string): Promise<boolean> {
    const key = `auth:mail-limit:${purpose}:${sha256Hex(email.toLowerCase())}`;
    const result = await this.redis
      .multi()
      .incr(key)
      .pexpire(key, EMAIL_SEND_LIMIT.windowMs, 'NX')
      .exec();
    return Number(result?.[0]?.[1] ?? 0) <= EMAIL_SEND_LIMIT.max;
  }
}
