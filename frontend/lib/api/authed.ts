import { dropSession, ensureSession } from '../auth/session';
import { publicEnv } from '../env';
import { createApiClient } from './client';

function withBearer(request: Request, token: string): Request {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(request, { headers });
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      statusCode: 401,
      code: 'SESSION_EXPIRED',
      message: 'Votre session a expiré. Reconnectez-vous pour continuer.',
      requestId: '',
    }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

/**
 * Requête authentifiée : jeton d'accès en mémoire ajouté en en-tête, renouvelé si besoin.
 * Si l'API répond 401 (jeton expiré entre-temps), un seul renouvellement puis un nouvel essai ;
 * au second refus, la session est close dans tous les onglets.
 */
async function authFetch(request: Request): Promise<Response> {
  const retry = request.clone();
  const session = await ensureSession();
  if (!session) return unauthorized();
  const response = await fetch(withBearer(request, session.accessToken));
  if (response.status !== 401) return response;

  const renewed = await ensureSession({ force: true });
  if (!renewed) return response;
  const second = await fetch(withBearer(retry, renewed.accessToken));
  if (second.status === 401) dropSession();
  return second;
}

/** Client des routes protégées (espace membre, achats, formations), navigateur uniquement. */
export const authedApi = createApiClient(publicEnv.apiUrl, authFetch);
