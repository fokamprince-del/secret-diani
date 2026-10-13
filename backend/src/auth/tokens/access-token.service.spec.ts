import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import type { AppConfigService } from '../../config/app-config.service';
import { AccessTokenService } from './access-token.service';

const SECRET_A = 'a'.repeat(40);
const SECRET_B = 'b'.repeat(40);

function service(current: string, previous?: string): AccessTokenService {
  const values: Record<string, string | undefined> = {
    JWT_ACCESS_SECRET: current,
    JWT_ACCESS_SECRET_PREVIOUS: previous,
  };
  return new AccessTokenService(new JwtService({}), {
    get: (key: string) => values[key],
  } as AppConfigService);
}

const session = { userId: 'u-1', sessionId: 's-1', role: 'client' as const, mfa: false };

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('AccessTokenService', () => {
  it('signe un jeton court (15 min client, 10 min admin) et le vérifie', () => {
    const tokens = service(SECRET_A);
    const signed = tokens.sign(session);
    expect(signed.expiresIn).toBe(900);
    expect(tokens.sign({ ...session, role: 'admin', mfa: true }).expiresIn).toBe(600);
    expect(tokens.verify(signed.accessToken)).toEqual({
      id: 'u-1',
      sessionId: 's-1',
      role: 'client',
      mfa: false,
    });
  });

  it('refuse un jeton signé avec un autre secret', () => {
    const forged = service(SECRET_B).sign(session).accessToken;
    expect(service(SECRET_A).verify(forged)).toBeNull();
  });

  it('accepte l’ancien secret pendant une rotation', () => {
    const old = service(SECRET_A).sign(session).accessToken;
    expect(service(SECRET_B, SECRET_A).verify(old)).not.toBeNull();
  });

  it('refuse l’algorithme « none » et les jetons altérés', () => {
    const tokens = service(SECRET_A);
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: 'u-1',
      sid: 's-1',
      role: 'admin',
      mfa: true,
      iat: now,
      exp: now + 600,
      iss: 'diani-api',
      aud: 'diani-site',
    };
    const unsigned = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.`;
    expect(tokens.verify(unsigned)).toBeNull();

    const [header, , signature] = tokens.sign(session).accessToken.split('.');
    expect(tokens.verify(`${header}.${base64url(payload)}.${signature}`)).toBeNull();
  });

  it('refuse un jeton expiré ou d’une autre audience', () => {
    const tokens = service(SECRET_A);
    const sign = (claims: object) => {
      const unsigned = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}`;
      const signature = createHmac('sha256', SECRET_A).update(unsigned).digest('base64url');
      return `${unsigned}.${signature}`;
    };
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: 'u', sid: 's', role: 'client', mfa: false, iss: 'diani-api' };
    expect(tokens.verify(sign({ ...claims, aud: 'diani-site', exp: now - 10 }))).toBeNull();
    expect(tokens.verify(sign({ ...claims, aud: 'autre', exp: now + 600 }))).toBeNull();
    expect(tokens.verify(sign({ ...claims, aud: 'diani-site', exp: now + 600 }))).not.toBeNull();
    expect(
      tokens.verify(sign({ ...claims, role: 'superadmin', aud: 'diani-site', exp: now + 600 })),
    ).toBeNull();
  });
});
