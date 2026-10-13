import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const OPTIONAL_AUTH_KEY = 'auth:optional';

/** Route accessible sans authentification. Toute autre route exige un jeton valide (refus par défaut). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Route accessible avec ou sans compte (panier, commande invitée) : sans en-tête `Authorization`,
 * la requête passe en anonyme ; avec un jeton, celui-ci est vérifié comme partout ailleurs
 * (un jeton invalide ou révoqué est refusé, jamais traité comme un invité).
 */
export const OptionalAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(OPTIONAL_AUTH_KEY, true);

/** Rôles autorisés sur la route (en plus de l'authentification). */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Utilisateur authentifié, ou undefined sur une route `@OptionalAuth()` appelée sans jeton. */
export const MaybeUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

/** Utilisateur authentifié (garanti par la garde globale sur les routes non publiques). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new Error('CurrentUser utilisé sur une route publique');
    return user;
  },
);
