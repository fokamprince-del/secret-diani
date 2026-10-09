import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { flattenValidationErrors } from './validation-messages';

/**
 * Validation stricte de toutes les entrées :
 * - propriétés inconnues refusées (anti mass-assignment) ;
 * - conversion de type explicite uniquement via les DTO ;
 * - messages d'erreur en français.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) =>
      new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Les données envoyées sont invalides.',
        flattenValidationErrors(errors),
      ),
  });
}
