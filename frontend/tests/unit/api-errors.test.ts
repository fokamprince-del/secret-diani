import { describe, expect, it } from 'vitest';
import { unwrap } from '@/lib/api/client';
import { ApiError, fieldMessages, NetworkError, toApiError, userMessage } from '@/lib/api/errors';

const response = (status: number) => new Response(null, { status });

describe('erreurs de l’API', () => {
  it('reprend le message et le code stables de l’API', () => {
    const error = toApiError(response(400), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Les données envoyées sont invalides.',
      errors: [{ field: 'email', messages: ['doit être une adresse e-mail valide'] }],
      requestId: 'abc',
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(userMessage(error)).toBe('Les données envoyées sont invalides.');
    expect(fieldMessages(error)).toEqual({ email: 'doit être une adresse e-mail valide' });
  });

  it('remplace un corps inattendu par un message par défaut en français', () => {
    expect(toApiError(response(429), 'texte brut').message).toMatch(/Trop de tentatives/);
    expect(toApiError(response(404), undefined).code).toBe('HTTP_404');
  });

  it('ne montre jamais de détail technique pour une erreur serveur', () => {
    const error = new ApiError(500, { message: 'TypeError at line 12', code: 'INTERNAL' });
    expect(userMessage(error)).toBe(
      'Le service rencontre un problème. Réessayez dans quelques instants.',
    );
  });

  it('explique une coupure réseau sans jargon', () => {
    expect(userMessage(new NetworkError())).toMatch(/Vérifiez votre connexion internet/);
    expect(userMessage(new Error('boom'))).toMatch(/erreur inattendue/);
  });

  it('unwrap renvoie la donnée ou lève une ApiError', () => {
    expect(unwrap({ data: { ok: true }, response: new Response('{}', { status: 200 }) })).toEqual({
      ok: true,
    });
    expect(() =>
      unwrap({ error: { message: 'Introuvable.' }, response: response(404) }),
    ).toThrowError(new ApiError(404, { message: 'Introuvable.' }));
  });
});
