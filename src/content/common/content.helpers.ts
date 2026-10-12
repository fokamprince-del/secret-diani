import { applyDecorators, Header, HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { Public } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';

export function notFound(message: string): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message);
}

export function fieldError(field: string, message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_ERROR,
    'Les données envoyées sont invalides.',
    [{ field, messages: [message] }],
  );
}

/**
 * Route publique de contenu, cacheable par le navigateur (1 min) et par le CDN (5 min),
 * puis servie périmée pendant la revalidation. L'ETag (Express) permet les réponses 304.
 */
export const PublicContent = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    Public(),
    Header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'),
  );

/** Nouvel ordre d'affichage (glisser-déposer dans l'administration). */
export class ReorderDto {
  @ApiProperty({ type: [String], description: 'Identifiants dans le nouvel ordre' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}
