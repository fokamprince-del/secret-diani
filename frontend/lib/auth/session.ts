import { publicEnv } from '../env';
import type { components } from '../api/schema';

export type AuthUser = components['schemas']['AuthUserDto'];
type Authenticated = components['schemas']['AuthenticatedResponseDto'];

export interface Session {
  accessToken: string;
  /** Horodatage (ms) d'expiration du jeton d'accès. */
  expiresAt: number;
  user: AuthUser;
}

/**
 * Session côté navigateur (DECISIONS D-F24) :
 * - le jeton d'accès (court) reste **en mémoire**, jamais dans un stockage du navigateur ;
 * - le jeton de renouvellement est un cookie HttpOnly posé par l'API (`/api/v1/auth`), illisible ici ;
 * - un témoin `diani_session=1` (sans valeur secrète) indique seulement qu'une session existe :
 *   il évite un appel inutile à l'API et permet au proxy de rediriger vers la connexion.
 *
 * L'API révoque toute la session si un jeton de renouvellement sert deux fois : les
 * renouvellements sont donc faits un à la fois, tous onglets confondus (Web Locks), et le jeton
 * obtenu est partagé avec les autres onglets (BroadcastChannel), qui n'ont plus à renouveler.
 */
export const SESSION_HINT_COOKIE = 'diani_session';
const CHANNEL = 'diani-auth';
const LOCK = 'diani-auth-refresh';
/** Marge avant expiration : le jeton est renouvelé un peu avant de ne plus être valable. */
const EARLY_MS = 30_000;
const CSRF_HEADERS = { 'X-CSRF-Token': '1' };

type Message = { type: 'session'; session: Session } | { type: 'logout' };
type Listener = (session: Session | null) => void;

let current: Session | null = null;
let refreshing: Promise<Session | null> | null = null;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event: MessageEvent<Message>) => {
      if (event.data.type === 'session') apply(event.data.session, false);
      else apply(null, false);
    };
  }
  return channel;
}

function apply(session: Session | null, broadcast: boolean) {
  current = session;
  setHint(session !== null);
  if (broadcast) {
    getChannel()?.postMessage(
      session
        ? ({ type: 'session', session } satisfies Message)
        : ({ type: 'logout' } satisfies Message),
    );
  }
  for (const listener of listeners) listener(session);
}

function setHint(present: boolean) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = present
    ? `${SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`
    : `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function hasSessionHint(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.cookie.split('; ').includes(`${SESSION_HINT_COOKIE}=1`)
  );
}

function fromResponse(data: Authenticated): Session {
  return {
    accessToken: data.accessToken,
    expiresAt: Date.now() + data.expiresIn * 1000,
    user: data.user,
  };
}

const isFresh = (session: Session | null): session is Session =>
  session !== null && session.expiresAt - Date.now() > EARLY_MS;

export function getSession(): Session | null {
  getChannel();
  return current;
}

export function subscribe(listener: Listener): () => void {
  getChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Session ouverte par la connexion (ou la vérification du second facteur). */
export function startSession(data: Authenticated): Session {
  const session = fromResponse(data);
  apply(session, true);
  return session;
}

async function withLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK, task);
  }
  return task();
}

/**
 * Jeton d'accès valable, renouvelé si besoin. `null` : pas (ou plus) de session.
 * Les appels simultanés partagent le même renouvellement.
 */
export function ensureSession({ force = false } = {}): Promise<Session | null> {
  getChannel();
  const stale = force ? current?.accessToken : undefined;
  if (!force && isFresh(current)) return Promise.resolve(current);
  refreshing ??= withLock(async () => {
    // Un autre onglet a peut-être renouvelé pendant l'attente du verrou.
    if (isFresh(current) && current.accessToken !== stale) return current;
    try {
      const response = await fetch(`${publicEnv.apiUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: CSRF_HEADERS,
      });
      if (response.ok) {
        const session = fromResponse((await response.json()) as Authenticated);
        apply(session, true);
        return session;
      }
      if (response.status === 401 || response.status === 403) apply(null, true);
      return null;
    } catch {
      // Réseau indisponible : la session n'est pas considérée comme perdue.
      return null;
    }
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Déconnexion de cet appareil (révoque la session côté API, prévient les autres onglets). */
export async function endSession(): Promise<void> {
  try {
    await fetch(`${publicEnv.apiUrl}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: CSRF_HEADERS,
    });
  } finally {
    apply(null, true);
  }
}

/** Session perdue côté API (mot de passe changé, compte supprimé, déconnexion partout). */
export function dropSession(): void {
  apply(null, true);
}
