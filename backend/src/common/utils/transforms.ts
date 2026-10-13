import { Transform } from 'class-transformer';

/** Supprime les espaces en début et fin de chaîne (les autres types sont laissés à la validation). */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Normalise une adresse e-mail : espaces retirés, minuscules. */
export const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/** Chaîne vide → null (champ facultatif effacé volontairement). */
export const EmptyToNull = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  });
