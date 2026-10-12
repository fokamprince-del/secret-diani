import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';

export const CSRF_HEADER = 'x-csrf-token';

/**
 * Protection CSRF des routes authentifiées par cookie (refresh, déconnexion), en plus de
 * `SameSite=Strict` (voir docs/DECISIONS.md, D-027) :
 * 1. en-tête personnalisé obligatoire — un formulaire ou une image d'un site tiers ne peut pas
 *    l'envoyer, et un `fetch` inter-origines déclenche un pré-vol CORS refusé ;
 * 2. `Origin` (ou à défaut `Referer`) doit appartenir à la liste blanche CORS ;
 * 3. `Sec-Fetch-Site: cross-site` est refusé.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(config: AppConfigService) {
    this.allowedOrigins = new Set(config.corsOrigins.map((origin) => origin.replace(/\/$/, '')));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.get(CSRF_HEADER);
    const origin = request.get('origin') ?? this.originOf(request.get('referer'));
    const fetchSite = request.get('sec-fetch-site');

    const valid =
      typeof header === 'string' &&
      header.length > 0 &&
      header.length <= 128 &&
      (origin === undefined || this.allowedOrigins.has(origin)) &&
      fetchSite !== 'cross-site';

    if (!valid) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.CSRF_REJECTED,
        'Requête refusée pour des raisons de sécurité. Merci de recharger la page.',
      );
    }
    return true;
  }

  private originOf(referer: string | undefined): string | undefined {
    if (!referer) return undefined;
    try {
      return new URL(referer).origin;
    } catch {
      return 'invalid';
    }
  }
}
