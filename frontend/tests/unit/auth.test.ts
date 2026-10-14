import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeReturnPath } from '@/lib/auth/navigation';

describe('adresse de retour après connexion', () => {
  it('garde un chemin interne avec sa requête', () => {
    expect(safeReturnPath('/espace-membre/profil?onglet=1')).toBe('/espace-membre/profil?onglet=1');
  });

  it.each([
    '//site-pirate.example',
    'https://site-pirate.example',
    '/\\site-pirate.example',
    'javascript:alert(1)',
    '',
    null,
  ])('refuse « %s » (redirection ouverte)', (value) => {
    expect(safeReturnPath(value)).toBe('/espace-membre');
  });
});

describe('session du navigateur', () => {
  const authenticated = {
    status: 'authenticated',
    accessToken: 'acces-1',
    expiresIn: 900,
    user: {
      id: 'u1',
      email: 'a@b.fr',
      role: 'client',
      firstName: 'Awa',
      lastName: '',
      mfaEnabled: false,
    },
  };

  beforeEach(() => {
    vi.resetModules();
    document.cookie = 'diani_session=; Max-Age=0; Path=/';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renouvellements simultanés : un seul appel à l’API (jeton à usage unique)', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(authenticated), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { ensureSession } = await import('@/lib/auth/session');
    const results = await Promise.all([ensureSession(), ensureSession(), ensureSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((session) => session?.accessToken)).toEqual([
      'acces-1',
      'acces-1',
      'acces-1',
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/auth\/refresh$/);
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': '1' },
    });
  });

  it('jeton encore valable : aucun renouvellement ; témoin de session posé', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { ensureSession, hasSessionHint, startSession } = await import('@/lib/auth/session');
    startSession(authenticated as never);
    expect(hasSessionHint()).toBe(true);
    expect((await ensureSession())?.accessToken).toBe('acces-1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('acces-1');
  });

  it('session refusée par l’API : fermée et témoin retiré', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    const { ensureSession, getSession, hasSessionHint, startSession } =
      await import('@/lib/auth/session');
    startSession({ ...authenticated, expiresIn: 0 } as never);
    expect(await ensureSession()).toBeNull();
    expect(getSession()).toBeNull();
    expect(hasSessionHint()).toBe(false);
  });

  it('réseau indisponible : la session n’est pas considérée comme perdue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('hors ligne'))),
    );
    const { ensureSession, hasSessionHint, startSession } = await import('@/lib/auth/session');
    startSession({ ...authenticated, expiresIn: 0 } as never);
    expect(await ensureSession()).toBeNull();
    expect(hasSessionHint()).toBe(true);
  });
});
