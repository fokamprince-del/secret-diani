import { HttpException } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

export interface FieldError {
  field: string;
  messages: string[];
}

/**
 * Exception métier dont le message (en français) est destiné à l'utilisateur final.
 * Les autres exceptions voient leur message remplacé par un message générique.
 */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: FieldError[],
  ) {
    super(message, status);
  }
}
