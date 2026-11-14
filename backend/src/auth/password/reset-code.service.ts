import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/** Durée de validité du code envoyé par e-mail. */
export const RESET_CODE_TTL_MS = 15 * 60_000;
/** Essais permis avant que le code ne soit détruit. */
export const RESET_CODE_MAX_ATTEMPTS = 5;

interface StoredCode {
  userId: string;
  hash: string;
  attempts: number;
}

const hashOf = (email: string) => createHash('sha256').update(email.toLowerCase()).digest('hex');
const KEY = (email: string) => `auth:reset-code:${hashOf(email)}`;
const digest = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest('hex');

/**
 * Code à 6 chiffres du mot de passe oublié, en plus du lien : pratique sur téléphone (on lit le
 * code dans l'e-mail, on le saisit sur le site). Un seul code actif par adresse, 15 minutes,
 * 5 essais ; seule une empreinte (liée au compte) est gardée dans Redis. Un code juste ne donne
 * qu'un jeton de réinitialisation ordinaire (usage unique, 30 minutes).
 */
@Injectable()
export class ResetCodeService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Nouveau code (l'éventuel précédent est remplacé). */
  async issue(email: string, userId: string): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const stored: StoredCode = { userId, hash: digest(userId, code), attempts: 0 };
    await this.redis.set(KEY(email), JSON.stringify(stored), 'PX', RESET_CODE_TTL_MS);
    return code;
  }

  /** Compte du code s'il est juste (et le code est consommé), sinon `null`. */
  async verify(email: string, code: string): Promise<string | null> {
    const key = KEY(email);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredCode;
    const expected = Buffer.from(stored.hash, 'hex');
    const received = Buffer.from(digest(stored.userId, code), 'hex');
    if (timingSafeEqual(expected, received)) {
      // Usage unique : seul le premier appel qui supprime la clé obtient le compte.
      return (await this.redis.del(key)) === 1 ? stored.userId : null;
    }
    stored.attempts += 1;
    if (stored.attempts >= RESET_CODE_MAX_ATTEMPTS) await this.redis.del(key);
    else await this.redis.set(key, JSON.stringify(stored), 'KEEPTTL');
    return null;
  }
}
