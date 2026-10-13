import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BlockList, isIP } from 'node:net';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';

/** « 192.0.2.0/24 », « 2001:db8::/32 » ou une adresse seule → liste d'adresses autorisées. */
export function buildAllowList(entries: string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [address, prefix] = entry.split('/');
    const family = isIP(address ?? '');
    if (family === 0) throw new Error(`WEBHOOK_ALLOWED_IPS : adresse invalide « ${entry} »`);
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) list.addAddress(address!, type);
    else list.addSubnet(address!, Number(prefix), type);
  }
  return list;
}

/**
 * Liste d'adresses autorisées sur les webhooks (« si possible », cahier des charges) : quand
 * `WEBHOOK_ALLOWED_IPS` est défini, seules ces adresses peuvent appeler les webhooks. La
 * signature reste vérifiée dans tous les cas : cette garde est une défense supplémentaire.
 */
@Injectable()
export class WebhookIpGuard implements CanActivate {
  private readonly allowList: BlockList | null;

  constructor(config: AppConfigService) {
    const entries = config.get('WEBHOOK_ALLOWED_IPS');
    this.allowList = entries?.length ? buildAllowList(entries) : null;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.allowList) return true;
    const ip = context.switchToHttp().getRequest<Request>().ip ?? '';
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const family = isIP(normalized);
    if (family !== 0 && this.allowList.check(normalized, family === 4 ? 'ipv4' : 'ipv6'))
      return true;
    throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Accès refusé.');
  }
}
