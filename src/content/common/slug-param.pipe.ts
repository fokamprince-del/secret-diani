import { Injectable, PipeTransform } from '@nestjs/common';
import { SLUG_PATTERN } from '../markdown/slug';
import { notFound } from './content.helpers';

/** Paramètre d'URL « slug » : tout format inattendu est traité comme une page inexistante (404). */
@Injectable()
export class SlugParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (value.length > 160 || !SLUG_PATTERN.test(value)) throw notFound('Contenu introuvable.');
    return value;
  }
}
