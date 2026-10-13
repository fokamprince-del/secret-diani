// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidateTag }));

const SECRET = 'un-secret-de-test-suffisamment-long-0123456789';

async function loadRoute(secret: string | undefined) {
  vi.resetModules();
  vi.stubEnv('REVALIDATE_SECRET', secret ?? '');
  return import('@/app/api/revalidate/route');
}

const post = (body: unknown, token?: string) =>
  new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/revalidate', () => {
  beforeEach(() => revalidateTag.mockReset());

  it('revalide les étiquettes envoyées par l’API', async () => {
    const { POST } = await loadRoute(SECRET);
    const response = await POST(post({ tags: ['faq', 'page:cgv', 'faq'] }, SECRET));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ['faq', 'page:cgv'] });
    expect(revalidateTag).toHaveBeenCalledWith('faq', 'max');
    expect(revalidateTag).toHaveBeenCalledWith('page:cgv', 'max');
  });

  it('refuse un secret absent ou faux', async () => {
    const { POST } = await loadRoute(SECRET);
    expect((await POST(post({ tags: ['faq'] }))).status).toBe(401);
    expect((await POST(post({ tags: ['faq'] }, `${SECRET}x`))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('refuse des étiquettes mal formées', async () => {
    const { POST } = await loadRoute(SECRET);
    expect((await POST(post({ tags: ['../etc'] }, SECRET))).status).toBe(400);
    expect((await POST(post({ tags: [] }, SECRET))).status).toBe(400);
    expect((await POST(post('pas du json', SECRET))).status).toBe(400);
  });

  it('reste fermé tant que le secret n’est pas configuré', async () => {
    const { POST } = await loadRoute(undefined);
    expect((await POST(post({ tags: ['faq'] }, ''))).status).toBe(503);
  });
});
