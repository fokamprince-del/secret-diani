import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { resolveRequestId } from '../common/utils/request-id';

/**
 * Chemins masqués par défense en profondeur : aucune donnée personnelle ni secret
 * ne doit apparaître dans les journaux, même si un appel de log les inclut par erreur.
 */
const SENSITIVE_KEYS = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'totp',
  'totpCode',
  'totpSecret',
  'backupCode',
  'email',
  'phone',
  'firstName',
  'lastName',
  'address',
  'ip',
  'authorization',
  'cookie',
];

/** Chaque clé sensible est masquée à la racine de l'objet journalisé et un niveau en dessous. */
export const REDACTED_PATHS = [
  'req.headers',
  'req.body',
  'req.query',
  'req.remoteAddress',
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`]),
];

const SILENT_PATHS = new Set(['/health', '/ready']);

/** Retire la chaîne de requête : elle peut contenir des jetons (liens de vérification…). */
function pathOnly(url: string | undefined): string {
  return (url ?? '').split('?')[0] ?? '';
}

export interface PinoOptionsInput {
  level: string;
  pretty: boolean;
}

export function createPinoHttpOptions({ level, pretty }: PinoOptionsInput): Options {
  return {
    level,
    base: { service: process.env.SERVICE_NAME ?? 'api' },
    messageKey: 'msg',
    redact: { paths: REDACTED_PATHS, censor: '[masqué]' },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveRequestId(req.headers['x-request-id']);
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // Seuls la méthode, le chemin et le statut sont journalisés (ni IP, ni en-têtes, ni corps).
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        path: pathOnly(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: (req: IncomingMessage) => SILENT_PATHS.has(pathOnly(req.url)) },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  };
}
