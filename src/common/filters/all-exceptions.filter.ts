import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';
import { AppException } from '../errors/app.exception';
import { defaultForStatus } from '../errors/error-codes';
import type { ErrorResponseDto } from '../errors/error-response';

interface ResolvedError {
  status: number;
  body: Omit<ErrorResponseDto, 'requestId'>;
}

/** Erreurs levées par body-parser (JSON mal formé, corps trop volumineux…). */
interface HttpLikeError {
  status: number;
  expose: boolean;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    'expose' in error &&
    error.expose === true
  );
}

/**
 * Filtre global : toute erreur est convertie au format unique `ErrorResponseDto`,
 * avec un message français. Aucun détail interne (pile, SQL, message technique)
 * n'est renvoyé au client ; les erreurs 5xx sont journalisées et remontées à Sentry.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const { status, body } = this.resolve(exception);
    const requestId = typeof request.id === 'string' ? request.id : '';

    if (status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Erreur serveur non gérée');
      Sentry.captureException(exception);
    }

    if (response.headersSent) return;
    response.status(status).json({ ...body, requestId });
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof AppException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          statusCode: status,
          code: exception.code,
          message: exception.message,
          ...(exception.fieldErrors ? { errors: exception.fieldErrors } : {}),
        },
      };
    }

    if (exception instanceof HttpException) {
      return this.fromStatus(exception.getStatus());
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return this.fromStatus(409);
      if (exception.code === 'P2025') return this.fromStatus(404);
    }

    if (isHttpLikeError(exception) && exception.status >= 400 && exception.status < 500) {
      return this.fromStatus(exception.status);
    }

    return this.fromStatus(500);
  }

  private fromStatus(status: number): ResolvedError {
    const { code, message } = defaultForStatus(status);
    return { status, body: { statusCode: status, code, message } };
  }
}
