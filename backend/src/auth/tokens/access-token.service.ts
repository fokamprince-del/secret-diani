import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AppConfigService } from '../../config/app-config.service';
import { JWT_AUDIENCE, JWT_ISSUER, SESSION_POLICIES } from '../auth.constants';

interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: UserRole;
  mfa: boolean;
}

export interface AccessToken {
  accessToken: string;
  /** Durée de validité en secondes. */
  expiresIn: number;
}

const ROLES: readonly UserRole[] = ['client', 'admin'];

function isPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.sid === 'string' &&
    typeof candidate.mfa === 'boolean' &&
    ROLES.includes(candidate.role as UserRole)
  );
}

/**
 * Jetons d'accès JWT courts (HS256, algorithme imposé à la vérification : pas de confusion d'algorithme).
 * Rotation du secret : l'ancien secret reste accepté en vérification seulement (voir RUNBOOK).
 */
@Injectable()
export class AccessTokenService {
  private readonly secrets: string[];

  constructor(
    private readonly jwt: JwtService,
    config: AppConfigService,
  ) {
    const previous = config.get('JWT_ACCESS_SECRET_PREVIOUS');
    this.secrets = [config.get('JWT_ACCESS_SECRET'), ...(previous ? [previous] : [])];
  }

  sign(session: { userId: string; sessionId: string; role: UserRole; mfa: boolean }): AccessToken {
    const expiresIn = Math.floor(SESSION_POLICIES[session.role].accessTtlMs / 1000);
    const payload: AccessTokenPayload = {
      sub: session.userId,
      sid: session.sessionId,
      role: session.role,
      mfa: session.mfa,
    };
    const accessToken = this.jwt.sign(payload, {
      secret: this.secrets[0],
      algorithm: 'HS256',
      expiresIn,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return { accessToken, expiresIn };
  }

  /** Identité portée par un jeton valide, ou null (signature, émetteur, audience ou expiration invalides). */
  verify(token: string): AuthenticatedUser | null {
    for (const secret of this.secrets) {
      try {
        const payload: unknown = this.jwt.verify(token, {
          secret,
          algorithms: ['HS256'],
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        });
        if (!isPayload(payload)) return null;
        return { id: payload.sub, sessionId: payload.sid, role: payload.role, mfa: payload.mfa };
      } catch {
        // Essai du secret suivant (rotation en cours), sinon jeton refusé.
      }
    }
    return null;
  }
}
