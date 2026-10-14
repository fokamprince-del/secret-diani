/**
 * Comptes de l'API factice, en mémoire. Reproduit les règles du vrai backend qui comptent pour
 * le frontend : cookie de renouvellement HttpOnly sur /api/v1/auth, rotation à chaque usage et
 * **révocation de toute la session si un jeton sert deux fois**, en-tête CSRF obligatoire.
 *
 * Comptes : toute adresse se connecte avec le mot de passe `MotDePasse-Solide-2026` (un compte
 * est créé à la première connexion, chaque test utilise sa propre adresse) ;
 * - `nonverifie…@…` : e-mail non confirmé (403) ;
 * - `admin…@…` : second facteur demandé, code `123456` ou code de secours `SECOURS-1` ;
 * - `nouvel-admin…@…` : configuration du second facteur à la première connexion.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { components } from '../../lib/api/schema';

type S = components['schemas'];

export const MOCK_PASSWORD = 'MotDePasse-Solide-2026';
const ACCESS_TTL_SECONDS = Number(process.env.MOCK_ACCESS_TTL ?? 900);
const COOKIE = 'diani_rt';

interface User {
  id: string;
  email: string;
  password: string;
  role: 'client' | 'admin';
  firstName: string;
  lastName: string | null;
  phone: string | null;
  marketingConsent: boolean;
  createdAt: string;
  addresses: S['AddressDto'][];
}

interface Session {
  id: string;
  userId: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  revoked: boolean;
}

const users = new Map<string, User>();
const sessions = new Map<string, Session>();
const refreshTokens = new Map<string, { sessionId: string; used: boolean }>();
const accessTokens = new Map<string, { sessionId: string; expiresAt: number }>();
let refreshCount = 0;

/** Nombre de renouvellements servis (contrôle des tests multi-onglets). */
export function refreshStats() {
  return { refreshCount };
}

type Send = (
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers?: Record<string, string | string[]>,
) => void;
type Fail = (
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  errors?: unknown,
) => void;

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  return (req.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];
}

function userFor(email: string): User {
  const key = email.trim().toLowerCase();
  let user = users.get(key);
  if (!user) {
    user = {
      id: randomUUID(),
      email: key,
      password: MOCK_PASSWORD,
      role: key.startsWith('admin') || key.startsWith('nouvel-admin') ? 'admin' : 'client',
      firstName: 'Awa',
      lastName: 'Diallo',
      phone: null,
      marketingConsent: false,
      createdAt: new Date().toISOString(),
      addresses: [],
    };
    users.set(key, user);
  }
  return user;
}

const userById = (id: string) => [...users.values()].find((user) => user.id === id);

function authUser(user: User): S['AuthUserDto'] {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    mfaEnabled: user.role === 'admin',
  };
}

function profile(user: User): S['ProfileDto'] {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    phone: user.phone ?? '',
    emailVerified: true,
    mfaEnabled: user.role === 'admin',
    marketingConsent: user.marketingConsent,
    createdAt: user.createdAt,
  };
}

function issue(res: ServerResponse, send: Send, session: Session, extra: object = {}) {
  const user = userById(session.userId)!;
  const refresh = randomUUID();
  const access = `acces-${randomUUID()}`;
  refreshTokens.set(refresh, { sessionId: session.id, used: false });
  accessTokens.set(access, {
    sessionId: session.id,
    expiresAt: Date.now() + ACCESS_TTL_SECONDS * 1000,
  });
  session.lastUsedAt = new Date().toISOString();
  send(
    res,
    200,
    {
      status: 'authenticated',
      accessToken: access,
      expiresIn: ACCESS_TTL_SECONDS,
      user: authUser(user),
      ...extra,
    },
    { 'Set-Cookie': `${COOKIE}=${refresh}; Path=/api/v1/auth; HttpOnly; SameSite=Strict` },
  );
}

function openSession(req: IncomingMessage, user: User): Session {
  const session: Session = {
    id: randomUUID(),
    userId: user.id,
    userAgent: req.headers['user-agent'] ?? null,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    revoked: false,
  };
  sessions.set(session.id, session);
  return session;
}

function revoke(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) session.revoked = true;
}

function bearer(req: IncomingMessage): { user: User; session: Session } | null {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const access = accessTokens.get(token);
  if (!access || access.expiresAt < Date.now()) return null;
  const session = sessions.get(access.sessionId);
  if (!session || session.revoked) return null;
  const user = userById(session.userId);
  return user ? { user, session } : null;
}

/** Identifiant de la personne connectée (jeton valable), sinon `null` : panier, commandes. */
export function bearerUserId(req: IncomingMessage): string | null {
  return bearer(req)?.user.id ?? null;
}

/** Identifiant d'un compte par son e-mail (aides de test de l'API factice). */
export function userIdForEmail(email: string): string | undefined {
  return users.get(email.trim().toLowerCase())?.id;
}

/** E-mail du compte connecté (commandes passées avec un compte). */
export function bearerEmail(req: IncomingMessage): string | null {
  return bearer(req)?.user.email ?? null;
}

const MESSAGES = {
  invalid: 'E-mail ou mot de passe incorrect.',
  expired: 'Votre session a expiré. Reconnectez-vous pour continuer.',
};

/** Routes d'authentification et de compte ; `false` si la route n'est pas gérée ici. */
export async function handleAuth(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  body: Record<string, unknown>,
  send: Send,
  fail: Fail,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const clearCookie = {
    'Set-Cookie': `${COOKIE}=; Path=/api/v1/auth; HttpOnly; SameSite=Strict; Max-Age=0`,
  };

  if (method === 'POST' && path === '/auth/register') {
    if (String(body.password ?? '').length < 12) {
      fail(res, 400, 'VALIDATION_ERROR', 'Les données envoyées sont invalides.', [
        { field: 'password', messages: ['doit contenir au moins 12 caractères'] },
      ]);
    } else {
      send(res, 202, {
        message: 'Compte créé : un e-mail de confirmation vient de vous être envoyé.',
      });
    }
    return true;
  }
  if (
    method === 'POST' &&
    (path === '/auth/email/verify' || path === '/auth/email/change/confirm')
  ) {
    if (body.token === 'jeton-valide') {
      send(res, 200, {
        message:
          path === '/auth/email/verify'
            ? 'Votre adresse est confirmée : vous pouvez vous connecter.'
            : 'Votre nouvelle adresse e-mail est confirmée.',
      });
    } else {
      fail(
        res,
        400,
        'INVALID_TOKEN',
        'Ce lien n’est plus valide. Il a peut-être expiré ou déjà servi.',
      );
    }
    return true;
  }
  if (method === 'POST' && (path === '/auth/email/resend' || path === '/auth/password/forgot')) {
    send(res, 202, {
      message: 'Si un compte correspond à cette adresse, un e-mail vient de vous être envoyé.',
    });
    return true;
  }
  if (method === 'POST' && path === '/auth/password/reset') {
    if (body.token !== 'jeton-valide') {
      fail(
        res,
        400,
        'INVALID_TOKEN',
        'Ce lien n’est plus valide. Il a peut-être expiré ou déjà servi.',
      );
    } else {
      send(res, 200, { message: 'Votre mot de passe est modifié. Vous pouvez vous connecter.' });
    }
    return true;
  }

  if (method === 'POST' && path === '/auth/login') {
    const email = String(body.email ?? '').toLowerCase();
    if (body.password !== MOCK_PASSWORD) {
      fail(res, 401, 'INVALID_CREDENTIALS', MESSAGES.invalid);
      return true;
    }
    if (email.startsWith('nonverifie')) {
      fail(
        res,
        403,
        'EMAIL_NOT_VERIFIED',
        'Confirmez d’abord votre adresse e-mail grâce au lien reçu.',
      );
      return true;
    }
    const user = userFor(email);
    if (user.role === 'admin') {
      send(res, 200, {
        status: email.startsWith('nouvel-admin') ? 'mfa_enrollment_required' : 'mfa_required',
        mfaToken: `mfa:${email}`,
      });
      return true;
    }
    issue(res, send, openSession(req, user));
    return true;
  }

  const mfaUser = () => {
    const token = String(body.mfaToken ?? '');
    return token.startsWith('mfa:') ? users.get(token.slice(4)) : undefined;
  };
  if (method === 'POST' && path === '/auth/2fa/enroll') {
    send(res, 200, {
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUrl: 'otpauth://totp/Les%20Secrets%20de%20Diani?secret=JBSWY3DPEHPK3PXP',
    });
    return true;
  }
  if (method === 'POST' && (path === '/auth/2fa/verify' || path === '/auth/2fa/enroll/confirm')) {
    const user = mfaUser();
    const valid =
      body.code === '123456' || (path === '/auth/2fa/verify' && body.backupCode === 'SECOURS-1');
    if (!user || !valid) {
      fail(res, 401, 'MFA_INVALID', 'Code incorrect ou expiré. Réessayez.');
      return true;
    }
    issue(
      res,
      send,
      openSession(req, user),
      path === '/auth/2fa/enroll/confirm'
        ? { backupCodes: ['SECOURS-1', 'SECOURS-2', 'SECOURS-3', 'SECOURS-4'] }
        : {},
    );
    return true;
  }

  if (method === 'POST' && (path === '/auth/refresh' || path === '/auth/logout')) {
    if (!req.headers['x-csrf-token']) {
      fail(
        res,
        403,
        'CSRF_REJECTED',
        'Requête refusée pour des raisons de sécurité. Merci de recharger la page.',
      );
      return true;
    }
    const token = cookieValue(req, COOKIE) ?? '';
    const entry = refreshTokens.get(token);
    if (path === '/auth/logout') {
      if (entry) revoke(entry.sessionId);
      send(res, 204, undefined, clearCookie);
      return true;
    }
    refreshCount += 1;
    const session = entry ? sessions.get(entry.sessionId) : undefined;
    if (!entry || !session || session.revoked) {
      fail(res, 401, 'SESSION_EXPIRED', MESSAGES.expired);
      return true;
    }
    if (entry.used) {
      // Réutilisation : comme le vrai backend, toute la session est révoquée.
      revoke(session.id);
      fail(res, 401, 'SESSION_EXPIRED', MESSAGES.expired);
      return true;
    }
    entry.used = true;
    issue(res, send, session);
    return true;
  }

  if (!path.startsWith('/me') && !path.startsWith('/auth/')) return false;
  const auth = bearer(req);
  if (!auth) {
    fail(res, 401, 'UNAUTHORIZED', MESSAGES.expired);
    return true;
  }
  const { user, session } = auth;

  if (method === 'POST' && path === '/auth/logout-all') {
    for (const entry of sessions.values()) if (entry.userId === user.id) entry.revoked = true;
    send(res, 204, undefined, clearCookie);
    return true;
  }
  if (method === 'POST' && path === '/auth/password/change') {
    if (body.currentPassword !== user.password) {
      fail(res, 400, 'VALIDATION_ERROR', 'Les données envoyées sont invalides.', [
        { field: 'currentPassword', messages: ['mot de passe actuel incorrect'] },
      ]);
      return true;
    }
    user.password = String(body.newPassword);
    for (const entry of sessions.values()) {
      if (entry.userId === user.id && entry.id !== session.id) entry.revoked = true;
    }
    send(res, 200, {
      message: 'Votre mot de passe est modifié. Vos autres appareils sont déconnectés.',
    });
    return true;
  }
  if (method === 'POST' && path === '/auth/email/change') {
    if (body.currentPassword !== user.password) {
      fail(res, 400, 'VALIDATION_ERROR', 'Les données envoyées sont invalides.', [
        { field: 'currentPassword', messages: ['mot de passe actuel incorrect'] },
      ]);
      return true;
    }
    send(res, 202, {
      message: 'Un lien de confirmation vient d’être envoyé à la nouvelle adresse.',
    });
    return true;
  }

  if (path === '/me') {
    if (method === 'GET') send(res, 200, profile(user));
    else if (method === 'PATCH') {
      if (typeof body.firstName === 'string') user.firstName = body.firstName;
      if ('lastName' in body) user.lastName = (body.lastName as string | null) ?? null;
      if ('phone' in body) user.phone = (body.phone as string | null) ?? null;
      if (typeof body.marketingConsent === 'boolean') user.marketingConsent = body.marketingConsent;
      send(res, 200, profile(user));
    } else if (method === 'DELETE') {
      if (body.password !== user.password) {
        fail(res, 400, 'VALIDATION_ERROR', 'Mot de passe incorrect.', [
          { field: 'password', messages: ['mot de passe incorrect'] },
        ]);
      } else {
        users.delete(user.email);
        for (const entry of sessions.values()) if (entry.userId === user.id) entry.revoked = true;
        send(res, 204, undefined, clearCookie);
      }
    }
    return true;
  }
  if (method === 'GET' && path === '/me/export') {
    send(
      res,
      200,
      { profil: profile(user), adresses: user.addresses },
      {
        'Content-Disposition': 'attachment; filename="mes-donnees.json"',
      },
    );
    return true;
  }
  if (path === '/me/sessions' && method === 'GET') {
    send(
      res,
      200,
      [...sessions.values()]
        .filter((entry) => entry.userId === user.id && !entry.revoked)
        .map((entry) => ({
          id: entry.id,
          current: entry.id === session.id,
          userAgent: entry.userAgent,
          ipTruncated: '127.0.0.0',
          createdAt: entry.createdAt,
          lastUsedAt: entry.lastUsedAt,
          expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        })) satisfies S['SessionViewDto'][],
    );
    return true;
  }
  const sessionMatch = /^\/me\/sessions\/([\w-]+)$/.exec(path);
  if (sessionMatch && method === 'DELETE') {
    const target = sessions.get(sessionMatch[1]!);
    if (!target || target.userId !== user.id) fail(res, 404, 'NOT_FOUND', 'Session introuvable.');
    else {
      target.revoked = true;
      send(res, 204);
    }
    return true;
  }
  if (path === '/me/addresses') {
    if (method === 'GET') send(res, 200, user.addresses);
    else if (method === 'POST') {
      const address = {
        id: randomUUID(),
        label: '',
        line2: '',
        country: 'FR',
        phone: '',
        isDefault: false,
        ...body,
      } as S['AddressDto'];
      if (address.isDefault) for (const entry of user.addresses) entry.isDefault = false;
      user.addresses.push(address);
      send(res, 201, address);
    }
    return true;
  }
  const addressMatch = /^\/me\/addresses\/([\w-]+)$/.exec(path);
  if (addressMatch) {
    const address = user.addresses.find((entry) => entry.id === addressMatch[1]);
    if (!address) fail(res, 404, 'NOT_FOUND', 'Adresse introuvable.');
    else if (method === 'PATCH') {
      if (body.isDefault) for (const entry of user.addresses) entry.isDefault = false;
      Object.assign(address, body);
      send(res, 200, address);
    } else if (method === 'DELETE') {
      user.addresses = user.addresses.filter((entry) => entry !== address);
      send(res, 204);
    }
    return true;
  }
  return false;
}
