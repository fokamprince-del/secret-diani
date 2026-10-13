import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { sha256Hex } from '../common/crypto/hash';
import { REDIS_CLIENT } from '../redis/redis.constants';

const MINUTE = 60_000;

interface Rule {
  /** Fenêtre de comptage des échecs. */
  windowMs: number;
  /** Nombre d'échecs avant le premier verrouillage. */
  threshold: number;
  /** Premier verrouillage, doublé à chaque échec supplémentaire… */
  baseLockMs: number;
  /** …dans la limite de ce plafond (pas de verrouillage définitif : pas de déni de service facile). */
  maxLockMs: number;
}

/**
 * Verrouillage progressif (voir docs/DECISIONS.md, D-026) :
 * - couple compte + IP : cible le brute force classique ;
 * - compte, toutes IP confondues : brute force distribué, seuil élevé, verrouillage court ;
 * - IP, tous comptes confondus : credential stuffing.
 * Les compteurs portent sur l'empreinte de l'e-mail saisi, que le compte existe ou non (anti-énumération).
 */
export const LOCKOUT_RULES = {
  pair: { windowMs: 60 * MINUTE, threshold: 5, baseLockMs: MINUTE, maxLockMs: 15 * MINUTE },
  subject: { windowMs: 60 * MINUTE, threshold: 20, baseLockMs: MINUTE, maxLockMs: 15 * MINUTE },
  ip: { windowMs: 15 * MINUTE, threshold: 50, baseLockMs: 15 * MINUTE, maxLockMs: 15 * MINUTE },
} satisfies Record<string, Rule>;

type Scope = keyof typeof LOCKOUT_RULES;

export function lockDurationMs(rule: Rule, failures: number): number {
  if (failures < rule.threshold) return 0;
  const exponent = Math.min(failures - rule.threshold, 20);
  return Math.min(rule.baseLockMs * 2 ** exponent, rule.maxLockMs);
}

@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Clé d'un sujet : e-mail normalisé (connexion) ou `user:<id>` (re-saisie du mot de passe). */
  private keys(subject: string, ip: string): Record<Scope, string> {
    const subjectHash = sha256Hex(subject.toLowerCase());
    return {
      pair: `auth:fail:pair:${subjectHash}:${ip}`,
      subject: `auth:fail:subject:${subjectHash}`,
      ip: `auth:fail:ip:${ip}`,
    };
  }

  /** Refuse (429) si l'un des verrous est actif, en indiquant le délai d'attente. */
  async assertAllowed(subject: string, ip: string): Promise<void> {
    const keys = this.keys(subject, ip);
    const ttls = await Promise.all(
      Object.values(keys).map((key) => this.redis.pttl(`${key}:lock`)),
    );
    const remainingMs = Math.max(0, ...ttls);
    if (remainingMs > 0) {
      const minutes = Math.ceil(remainingMs / MINUTE);
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.TOO_MANY_ATTEMPTS,
        `Trop de tentatives. Merci de réessayer dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      );
    }
  }

  /** Enregistre un échec ; retourne vrai si un verrou vient d'être posé. */
  async recordFailure(subject: string, ip: string): Promise<boolean> {
    const keys = this.keys(subject, ip);
    let locked = false;
    for (const scope of Object.keys(keys) as Scope[]) {
      const rule = LOCKOUT_RULES[scope];
      const key = keys[scope];
      const result = await this.redis.multi().incr(key).pexpire(key, rule.windowMs, 'NX').exec();
      const failures = Number(result?.[0]?.[1] ?? 0);
      const lockMs = lockDurationMs(rule, failures);
      if (lockMs > 0) {
        await this.redis.set(`${key}:lock`, '1', 'PX', lockMs);
        locked = true;
      }
    }
    return locked;
  }

  /** Levée par l'administration du verrou posé sur un e-mail (le verrou par IP expire seul). */
  async resetSubject(subject: string): Promise<void> {
    const keys = this.keys(subject, '');
    await this.redis.del(keys.subject, `${keys.subject}:lock`);
  }

  /** Après un succès : remise à zéro des compteurs du sujet (pas de celui de l'IP). */
  async reset(subject: string, ip: string): Promise<void> {
    const keys = this.keys(subject, ip);
    await this.redis.del(keys.pair, `${keys.pair}:lock`, keys.subject, `${keys.subject}:lock`);
  }
}
