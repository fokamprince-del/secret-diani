import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/** Borne la durée de traitement de chaque requête HTTP. */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly timeoutMs: number;

  constructor(config: AppConfigService) {
    this.timeoutMs = config.get('HTTP_REQUEST_TIMEOUT_MS');
  }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError
            ? new AppException(
                HttpStatus.SERVICE_UNAVAILABLE,
                ErrorCode.TIMEOUT,
                'Le traitement a pris trop de temps. Merci de réessayer.',
              )
            : error,
        ),
      ),
    );
  }
}
