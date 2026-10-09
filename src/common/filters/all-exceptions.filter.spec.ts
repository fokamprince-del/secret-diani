import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Captured {
  status?: number;
  body?: Record<string, unknown>;
}

function createHost(captured: Captured, headersSent = false): ArgumentsHost {
  const response = {
    headersSent,
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
  };
  const request = { id: 'req-123' };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeAll(() => {
    // Les erreurs 5xx sont journalisées : on évite le bruit dans la sortie des tests.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  function run(exception: unknown): Captured {
    const captured: Captured = {};
    filter.catch(exception, createHost(captured));
    return captured;
  }

  it('renvoie le message métier d’une AppException avec les erreurs de champs', () => {
    const result = run(
      new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, 'Données invalides.', [
        { field: 'email', messages: ['doit être une adresse e-mail valide'] },
      ]),
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Données invalides.',
      errors: [{ field: 'email', messages: ['doit être une adresse e-mail valide'] }],
      requestId: 'req-123',
    });
  });

  it('remplace le message anglais des exceptions Nest par un message français', () => {
    const result = run(new NotFoundException('Cannot GET /api/v1/secret-route'));
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: 'NOT_FOUND', message: 'Ressource introuvable.' });
    expect(JSON.stringify(result.body)).not.toContain('secret-route');

    expect(run(new BadRequestException('Unexpected token')).body).toMatchObject({
      message: 'La requête est invalide.',
    });
  });

  it('convertit les erreurs Prisma connues sans exposer de détail SQL', () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: 'test' },
    );
    const result = run(conflict);
    expect(result.status).toBe(409);
    expect(JSON.stringify(result.body)).not.toContain('email');

    const missing = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(run(missing).status).toBe(404);
  });

  it('masque totalement les erreurs inattendues (500)', () => {
    const result = run(new Error('connexion refusée à db-interne:5432 (password=xyz)'));
    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne est survenue. Merci de réessayer plus tard.',
      requestId: 'req-123',
    });
  });

  it('traduit les erreurs body-parser (corps trop volumineux)', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });
    const result = run(tooLarge);
    expect(result.status).toBe(413);
    expect(result.body).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'La requête est trop volumineuse.',
    });
  });

  it('n’écrit rien si la réponse est déjà partie', () => {
    const captured: Captured = {};
    filter.catch(new Error('x'), createHost(captured, true));
    expect(captured.status).toBeUndefined();
  });
});
