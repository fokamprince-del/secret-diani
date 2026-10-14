/**
 * Sonde de vie pour Traefik et le déploiement : le serveur Next répond. Volontairement sans
 * dépendance (l'API a ses propres sondes) : une API en difficulté ne doit pas retirer le site,
 * qui sert ses pages depuis le cache.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
