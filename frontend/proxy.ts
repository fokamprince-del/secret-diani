import { type NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from './lib/csp';

/** Témoin posé par le navigateur à la connexion (aucune valeur secrète, voir lib/auth/session). */
const SESSION_HINT = 'diani_session';
const PROTECTED = ['/espace-membre'];

/**
 * Pages privées (DECISIONS D-F05, D-F24) :
 * 1. sans témoin de session, l'espace membre redirige vers la connexion avec retour à la page
 *    demandée (l'API reste seule juge : chaque donnée exige un jeton valide) ;
 * 2. CSP à nonce, nouveau à chaque requête : seuls les scripts de Next qui le portent s'exécutent.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
    request.cookies.get(SESSION_HINT)?.value !== '1'
  ) {
    const login = new URL('/connexion', request.url);
    login.searchParams.set('retour', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/(espace-membre|connexion|inscription|mot-de-passe-oublie|reinitialiser|verifier-email|confirmer-email|panier|commande)(.*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
