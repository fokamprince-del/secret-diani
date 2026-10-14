import { afterEach, describe, expect, it, vi } from 'vitest';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound }));

const get = vi.fn();
vi.mock('@/lib/api/server', () => ({
  serverApi: { GET: (...args: unknown[]) => get(...args) },
  cached: () => fetch,
}));

const { getArticle, getFaq, getPage } = await import('@/lib/api/content');

function response(status: number, data?: unknown) {
  const res = new Response(JSON.stringify(data ?? {}), { status });
  return status < 400 ? { data, response: res } : { error: data, response: res };
}

afterEach(() => {
  vi.unstubAllEnvs();
  get.mockReset();
  notFound.mockClear();
});

describe('chargement des contenus publics', () => {
  it('renvoie la donnée de l’API', async () => {
    get.mockResolvedValue(response(200, { items: [], jsonLd: {} }));
    await expect(getFaq()).resolves.toEqual({ items: [], jsonLd: {} });
  });

  it('pendant le build, une API injoignable donne une page dégradée (null)', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockResolvedValue(response(503, { message: 'indisponible' }));
    await expect(getFaq()).resolves.toBeNull();
  });

  it('à l’exécution, l’erreur remonte : Next garde la dernière version réussie', async () => {
    get.mockResolvedValue(response(503, { message: 'indisponible' }));
    await expect(getFaq()).rejects.toThrow();
  });

  it('une page ou un article absent donne une 404', async () => {
    get.mockResolvedValue(response(404, { message: 'introuvable' }));
    await expect(getPage('cgv')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(getArticle('inconnu')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('une adresse mal formée n’est jamais transmise à l’API', async () => {
    await expect(getPage('../admin')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(getArticle('Article%20X')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(get).not.toHaveBeenCalled();
  });
});
