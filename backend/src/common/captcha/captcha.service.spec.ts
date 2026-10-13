import type { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../errors/app.exception';
import { CaptchaService } from './captcha.service';

function service(secret: string | undefined): CaptchaService {
  return new CaptchaService({ get: () => secret } as unknown as AppConfigService);
}

function mockFetch(response: Partial<Response> | Error): jest.SpyInstance {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response),
    );
}

describe('CaptchaService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sans clé (développement, tests), ne vérifie rien et n’appelle pas Cloudflare', async () => {
    const fetchSpy = mockFetch(new Error('ne doit pas être appelé'));
    await expect(service(undefined).verify(undefined, '203.0.113.7')).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuse un formulaire sans jeton quand la clé est configurée', async () => {
    await expect(
      service('secret-0123456789').verify(undefined, '203.0.113.7'),
    ).rejects.toMatchObject({
      code: 'CAPTCHA_FAILED',
    });
  });

  it('accepte un jeton validé par Cloudflare (URL fixe, secret et IP transmis)', async () => {
    const fetchSpy = mockFetch({ ok: true, json: () => Promise.resolve({ success: true }) });
    await service('secret-0123456789').verify('jeton', '203.0.113.7');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe('secret-0123456789');
    expect(body.get('response')).toBe('jeton');
    expect(body.get('remoteip')).toBe('203.0.113.7');
  });

  it('refuse un jeton rejeté par Cloudflare', async () => {
    mockFetch({
      ok: true,
      json: () => Promise.resolve({ success: false, 'error-codes': ['invalid-input-response'] }),
    });
    const error = await service('secret-0123456789')
      .verify('jeton', '203.0.113.7')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(400);
  });

  it('refuse aussi quand Cloudflare est injoignable (503, jamais ouvert sans contrôle)', async () => {
    mockFetch(new Error('ECONNRESET'));
    const error = await service('secret-0123456789')
      .verify('jeton', '203.0.113.7')
      .catch((caught: unknown) => caught);
    expect((error as AppException).getStatus()).toBe(503);
  });
});
