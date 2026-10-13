import type { ValidationError } from 'class-validator';
import type { FieldError } from '../errors/app.exception';

/**
 * Traductions françaises des contraintes class-validator.
 * `{n}` est remplacé par la première valeur numérique du message d'origine
 * (ex. « must be longer than or equal to 12 characters » → 12).
 */
const MESSAGES: Record<string, string> = {
  whitelistValidation: 'ce champ n’est pas autorisé',
  isDefined: 'ce champ est obligatoire',
  isNotEmpty: 'ce champ ne doit pas être vide',
  isString: 'doit être une chaîne de caractères',
  isBoolean: 'doit être un booléen',
  isNumber: 'doit être un nombre',
  isInt: 'doit être un nombre entier',
  isPositive: 'doit être un nombre positif',
  isEmail: 'doit être une adresse e-mail valide',
  isUrl: 'doit être une URL valide',
  isUUID: 'doit être un identifiant valide',
  isEnum: 'doit faire partie des valeurs autorisées',
  isIn: 'doit faire partie des valeurs autorisées',
  isArray: 'doit être une liste',
  isObject: 'doit être un objet',
  isDateString: 'doit être une date valide (format ISO 8601)',
  isISO8601: 'doit être une date valide (format ISO 8601)',
  isPhoneNumber: 'doit être un numéro de téléphone valide',
  isMobilePhone: 'doit être un numéro de téléphone valide',
  matches: 'n’a pas le format attendu',
  minLength: 'doit contenir au moins {n} caractères',
  maxLength: 'doit contenir au plus {n} caractères',
  length: 'n’a pas la longueur attendue',
  min: 'doit être supérieur ou égal à {n}',
  max: 'doit être inférieur ou égal à {n}',
  arrayMinSize: 'doit contenir au moins {n} éléments',
  arrayMaxSize: 'doit contenir au plus {n} éléments',
  arrayNotEmpty: 'ne doit pas être vide',
  nestedValidation: 'contient des valeurs invalides',
};

const DEFAULT_MESSAGE = 'valeur invalide';

export function translateConstraint(constraint: string, originalMessage: string): string {
  const template = MESSAGES[constraint];
  if (!template) {
    // Messages personnalisés déjà rédigés en français dans les DTO (préfixe « fr: »).
    return originalMessage.startsWith('fr:') ? originalMessage.slice(3).trim() : DEFAULT_MESSAGE;
  }
  if (!template.includes('{n}')) return template;
  const value = /-?\d+(?:\.\d+)?/.exec(originalMessage)?.[0];
  return value ? template.replace('{n}', value) : DEFAULT_MESSAGE;
}

/** Aplatit l'arbre d'erreurs class-validator en liste de champs (« adresse.ville »). */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  const result: FieldError[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      result.push({
        field,
        messages: Object.entries(error.constraints).map(([constraint, message]) =>
          translateConstraint(constraint, message),
        ),
      });
    }
    if (error.children?.length) {
      result.push(...flattenValidationErrors(error.children, field));
    }
  }
  return result;
}
