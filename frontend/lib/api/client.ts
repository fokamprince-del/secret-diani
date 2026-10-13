import createClient, { type Client, type Middleware } from 'openapi-fetch';
import { publicEnv } from '../env';
import { NetworkError, toApiError } from './errors';
import type { paths } from './schema';

export type ApiClient = Client<paths>;

/** Délai maximal d'une requête vers l'API : au-delà, l'interface propose de réessayer. */
const TIMEOUT_MS = 10_000;

const timeout: Middleware = {
  onRequest({ request }) {
    if (request.signal && 'any' in AbortSignal) {
      return new Request(request, {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
    }
    return undefined;
  },
  onError({ error }) {
    return new NetworkError(error) as Error;
  },
};

/** Client typé (généré depuis l'OpenAPI du backend), utilisable côté serveur comme navigateur. */
export function createApiClient(baseUrl: string = publicEnv.apiUrl): ApiClient {
  const client = createClient<paths>({ baseUrl, credentials: 'include' });
  client.use(timeout);
  return client;
}

/** Client du navigateur (sans authentification). L'auth s'ajoute en phase 4. */
export const browserApi = createApiClient();

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Renvoie la donnée d'une réponse réussie, ou lève une `ApiError` (message en français).
 * Les erreurs réseau sont déjà converties en `NetworkError` par le middleware.
 */
export function unwrap<T>(result: Result<T>): T {
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.response, result.error);
  }
  return result.data as T;
}
