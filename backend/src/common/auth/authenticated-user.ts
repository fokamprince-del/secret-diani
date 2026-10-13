import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

/** Identité extraite du jeton d'accès, attachée à la requête par la garde globale. */
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  sessionId: string;
  /** Session ouverte avec un second facteur validé. */
  mfa: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
