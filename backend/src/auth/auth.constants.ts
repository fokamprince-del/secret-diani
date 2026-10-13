import type { UserRole } from '@prisma/client';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Durées de vie des jetons et sessions (voir docs/DECISIONS.md, D-024). */
export interface SessionPolicy {
  /** Jeton d'accès JWT. */
  accessTtlMs: number;
  /** Refresh token (renouvelé à chaque usage) : durée d'inactivité maximale. */
  refreshTtlMs: number;
  /** Durée de vie absolue d'une session, quelle que soit l'activité. */
  sessionMaxMs: number;
}

export const SESSION_POLICIES: Record<UserRole, SessionPolicy> = {
  client: { accessTtlMs: 15 * MINUTE, refreshTtlMs: 30 * DAY, sessionMaxMs: 60 * DAY },
  // Sessions d'administration plus courtes : 10 min, 1 h d'inactivité, 12 h au total.
  admin: { accessTtlMs: 10 * MINUTE, refreshTtlMs: HOUR, sessionMaxMs: 12 * HOUR },
};

/** Durée maximale d'un jeton d'accès, tous rôles confondus (liste de révocation Redis). */
export const MAX_ACCESS_TTL_MS = Math.max(
  ...Object.values(SESSION_POLICIES).map((policy) => policy.accessTtlMs),
);

export const EMAIL_VERIFICATION_TTL_MS = DAY;
export const PASSWORD_RESET_TTL_MS = 30 * MINUTE;
export const EMAIL_CHANGE_TTL_MS = HOUR;

/** Défi 2FA (entre le mot de passe et le code) : 5 min, 5 essais. */
export const MFA_CHALLENGE_TTL_MS = 5 * MINUTE;
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
export const MFA_BACKUP_CODE_COUNT = 10;
export const MFA_ISSUER = 'Les Secrets de Diani';

/** Envois d'e-mails liés à un compte (vérification, réinitialisation) : 3 par heure et par adresse. */
export const EMAIL_SEND_LIMIT = { max: 3, windowMs: HOUR };

/** Durée minimale des réponses sensibles à l'énumération (inscription, mot de passe oublié…). */
export const ANTI_ENUMERATION_MIN_MS = 400;

export const REFRESH_COOKIE = 'diani_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const JWT_ISSUER = 'diani-api';
export const JWT_AUDIENCE = 'diani-site';
