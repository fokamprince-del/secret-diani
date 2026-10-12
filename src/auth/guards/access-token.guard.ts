import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../common/auth/authenticated-user';
import { IS_PUBLIC_KEY } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { SessionsService } from '../../sessions/sessions.service';
import { AccessTokenService } from '../tokens/access-token.service';

function unauthorized(): AppException {
  return new AppException(
    HttpStatus.UNAUTHORIZED,
    ErrorCode.UNAUTHORIZED,
    'Authentification requise.',
  );
}

/**
 * Garde globale « refus par défaut » : toute route exige un jeton d'accès valide,
 * sauf celles marquées `@Public()`. Les jetons d'une session révoquée sont refusés immédiatement.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    const user = this.tokens.verify(token);
    if (!user) throw unauthorized();
    // Un administrateur n'a jamais de session sans second facteur.
    if (user.role === 'admin' && !user.mfa) throw unauthorized();
    if (await this.sessions.isRevoked(user.sessionId)) throw unauthorized();

    request.user = user;
    return true;
  }
}
