import { isUuid, uuidv7 } from './uuid';

/** Réutilise l'identifiant de requête entrant s'il est bien formé, sinon en génère un (UUID v7). */
export function resolveRequestId(incoming: unknown): string {
  if (typeof incoming === 'string' && incoming.length <= 64 && isUuid(incoming)) {
    return incoming;
  }
  return uuidv7();
}
