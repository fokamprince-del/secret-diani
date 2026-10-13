import type { Job } from 'bullmq';
import type { AppConfigService } from '../../config/app-config.service';
import type { RevalidateJobData } from './revalidate.constants';
import { RevalidateProcessor } from './revalidate.processor';

function processor(values: Record<string, string | undefined>): RevalidateProcessor {
  return new RevalidateProcessor({ get: (key: string) => values[key] } as AppConfigService);
}

const job = { data: { tags: ['articles', 'article:creme'] } } as Job<RevalidateJobData>;

describe('RevalidateProcessor', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  it('ne fait rien sans configuration', async () => {
    await processor({}).process(job);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prévient le frontend avec le secret partagé, sans suivre de redirection', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await processor({
      FRONTEND_REVALIDATE_URL: 'https://site.fr/api/revalidate',
      FRONTEND_REVALIDATE_SECRET: 's'.repeat(32),
    }).process(job);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://site.fr/api/revalidate');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${'s'.repeat(32)}` });
    expect(JSON.parse(init.body as string)).toEqual({ tags: ['articles', 'article:creme'] });
  });

  it('échoue (donc relance) si le frontend refuse', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      processor({
        FRONTEND_REVALIDATE_URL: 'https://site.fr/api/revalidate',
        FRONTEND_REVALIDATE_SECRET: 's'.repeat(32),
      }).process(job),
    ).rejects.toThrow('Revalidation refusée (401)');
  });
});
