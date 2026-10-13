import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY, ROLES_KEY } from '../../common/auth/decorators';
import type { AppConfigService } from '../../config/app-config.service';
import type { SessionsService } from '../../sessions/sessions.service';
import type { AccessTokenService } from '../tokens/access-token.service';
import { AccessTokenGuard } from './access-token.guard';
import { CsrfGuard } from './csrf.guard';
import { RolesGuard } from './roles.guard';

interface FakeRequest {
  headers: Record<string, string>;
  user?: AuthenticatedUser;
  get(name: string): string | undefined;
}

function request(headers: Record<string, string> = {}, user?: AuthenticatedUser): FakeRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: lower, user, get: (name) => lower[name.toLowerCase()] };
}

function context(req: FakeRequest, metadata: Record<string, unknown> = {}): ExecutionContext {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const client: AuthenticatedUser = { id: 'u', sessionId: 's', role: 'client', mfa: false };
const admin: AuthenticatedUser = { id: 'a', sessionId: 's', role: 'admin', mfa: true };

describe('AccessTokenGuard (refus par défaut)', () => {
  const tokens = { verify: jest.fn() } as unknown as jest.Mocked<AccessTokenService>;
  const sessions = { isRevoked: jest.fn() } as unknown as jest.Mocked<SessionsService>;
  const guard = new AccessTokenGuard(new Reflector(), tokens, sessions);

  beforeEach(() => {
    jest.resetAllMocks();
    sessions.isRevoked.mockResolvedValue(false);
  });

  it('laisse passer une route @Public() sans jeton', async () => {
    await expect(guard.canActivate(context(request(), { [IS_PUBLIC_KEY]: true }))).resolves.toBe(
      true,
    );
  });

  it.each<Record<string, string>>([
    {},
    { authorization: 'Basic abc' },
    { authorization: 'Bearer' },
  ])('refuse sans jeton Bearer (%p)', async (headers) => {
    await expect(guard.canActivate(context(request(headers)))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('refuse un jeton invalide', async () => {
    tokens.verify.mockReturnValue(null);
    await expect(
      guard.canActivate(context(request({ authorization: 'Bearer x' }))),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('refuse un jeton d’une session révoquée', async () => {
    tokens.verify.mockReturnValue(client);
    sessions.isRevoked.mockResolvedValue(true);
    await expect(
      guard.canActivate(context(request({ authorization: 'Bearer x' }))),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('refuse un jeton administrateur sans second facteur', async () => {
    tokens.verify.mockReturnValue({ ...admin, mfa: false });
    await expect(
      guard.canActivate(context(request({ authorization: 'Bearer x' }))),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('attache l’utilisateur à la requête', async () => {
    tokens.verify.mockReturnValue(client);
    const req = request({ authorization: 'Bearer x' });
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.user).toEqual(client);
  });

  describe('@OptionalAuth() (panier, commande invitée)', () => {
    const optional = { [OPTIONAL_AUTH_KEY]: true };

    it('laisse passer un invité sans en-tête Authorization, sans utilisateur', async () => {
      const req = request();
      await expect(guard.canActivate(context(req, optional))).resolves.toBe(true);
      expect(req.user).toBeUndefined();
      expect(tokens.verify).not.toHaveBeenCalled();
    });

    it('vérifie un jeton présent et attache l’utilisateur', async () => {
      tokens.verify.mockReturnValue(client);
      const req = request({ authorization: 'Bearer x' });
      await expect(guard.canActivate(context(req, optional))).resolves.toBe(true);
      expect(req.user).toEqual(client);
    });

    it('refuse un jeton invalide ou révoqué au lieu de le traiter en invité', async () => {
      tokens.verify.mockReturnValue(null);
      await expect(
        guard.canActivate(context(request({ authorization: 'Bearer x' }), optional)),
      ).rejects.toMatchObject({ status: 401 });
      tokens.verify.mockReturnValue(client);
      sessions.isRevoked.mockResolvedValue(true);
      await expect(
        guard.canActivate(context(request({ authorization: 'Bearer x' }), optional)),
      ).rejects.toMatchObject({ status: 401 });
    });
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('laisse passer sans exigence de rôle', () => {
    expect(guard.canActivate(context(request({}, client)))).toBe(true);
  });

  it('refuse un client sur une route administrateur (403)', () => {
    expect(() =>
      guard.canActivate(context(request({}, client), { [ROLES_KEY]: ['admin'] })),
    ).toThrow(expect.objectContaining({ status: 403 }) as Error);
  });

  it('accepte un administrateur avec second facteur', () => {
    expect(guard.canActivate(context(request({}, admin), { [ROLES_KEY]: ['admin'] }))).toBe(true);
  });
});

describe('CsrfGuard', () => {
  const guard = new CsrfGuard({
    corsOrigins: ['https://lessecretsdediani.fr'],
  } as AppConfigService);
  const check = (headers: Record<string, string>) => () =>
    guard.canActivate(context(request(headers)));

  it('exige l’en-tête X-CSRF-Token', () => {
    expect(check({})).toThrow(expect.objectContaining({ status: 403 }) as Error);
    expect(check({ 'x-csrf-token': '1' })()).toBe(true);
  });

  it('vérifie l’origine (Origin, sinon Referer)', () => {
    expect(check({ 'x-csrf-token': '1', origin: 'https://lessecretsdediani.fr' })()).toBe(true);
    expect(check({ 'x-csrf-token': '1', origin: 'https://evil.example' })).toThrow();
    expect(check({ 'x-csrf-token': '1', referer: 'https://evil.example/page' })).toThrow();
    expect(check({ 'x-csrf-token': '1', referer: 'pas une url' })).toThrow();
    expect(
      check({ 'x-csrf-token': '1', referer: 'https://lessecretsdediani.fr/connexion' })(),
    ).toBe(true);
  });

  it('refuse Sec-Fetch-Site: cross-site', () => {
    expect(check({ 'x-csrf-token': '1', 'sec-fetch-site': 'cross-site' })).toThrow();
    expect(check({ 'x-csrf-token': '1', 'sec-fetch-site': 'same-site' })()).toBe(true);
  });
});
