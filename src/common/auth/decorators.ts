import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** Route accessible sans authentification. Toute autre route exige un jeton valide (refus par défaut). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Rôles autorisés sur la route (en plus de l'authentification). */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Utilisateur authentifié (garanti par la garde globale sur les routes non publiques). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new Error('CurrentUser utilisé sur une route publique');
    return user;
  },
);
