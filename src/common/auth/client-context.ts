import type { Request } from 'express';
import { truncateIp } from '../utils/ip';

/** Contexte client minimal conservé pour les sessions et l'audit (IP tronquée uniquement). */
export interface ClientContext {
  /** IP complète : utilisée en mémoire pour la limitation de débit, jamais stockée. */
  ip: string;
  ipTruncated: string | null;
  userAgent: string | null;
}

export function clientContext(req: Request): ClientContext {
  const ip = req.ip ?? '';
  const userAgent = req.get('user-agent');
  return {
    ip,
    ipTruncated: truncateIp(ip),
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
  };
}
