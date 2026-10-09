import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FieldError } from './app.exception';

class FieldErrorDto implements FieldError {
  @ApiProperty({ example: 'email' })
  field!: string;

  @ApiProperty({ example: ['doit être une adresse e-mail valide'] })
  messages!: string[];
}

/** Format unique de toutes les réponses d'erreur de l'API. */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code!: string;

  @ApiProperty({ example: 'Les données envoyées sont invalides.' })
  message!: string;

  @ApiPropertyOptional({ type: [FieldErrorDto] })
  errors?: FieldError[];

  @ApiProperty({ example: '01928f6e-7c1a-7b3e-9a6f-2f1c3d4e5f60' })
  requestId!: string;
}
