import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { checkPasswordPolicy, type PasswordContext } from './password-policy';

/** Paramètres Argon2id recommandés par OWASP (Password Storage Cheat Sheet) : m=19 Mio, t=2, p=1. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  /** Empreinte factice : la vérification coûte le même temps, que le compte existe ou non. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(32).toString('base64'));
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /** Vérifie un mot de passe ; sans empreinte (compte inexistant), compare à l'empreinte factice. */
  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    try {
      const matches = await argon2.verify(hash ?? this.dummyHash, password);
      return matches && Boolean(hash);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  /** Lève une erreur de validation (champ `field`) si le mot de passe ne respecte pas la politique. */
  assertPolicy(password: string, context: PasswordContext, field = 'password'): void {
    const problems = checkPasswordPolicy(password, context);
    if (problems.length > 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Les données envoyées sont invalides.',
        [{ field, messages: problems }],
      );
    }
  }
}
