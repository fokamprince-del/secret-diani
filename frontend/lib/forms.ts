import { z } from 'zod';
import { EMAIL_MESSAGES } from './form-messages';

/**
 * Schémas de formulaire partagés, messages en français. Ils reprennent les règles de l'API
 * (qui reste seule juge) pour signaler les erreurs avant l'envoi.
 */
export const emailField = z
  .string()
  .trim()
  .min(1, EMAIL_MESSAGES.missing)
  .max(254, EMAIL_MESSAGES.tooLong)
  .pipe(z.email(EMAIL_MESSAGES.invalid));

/** Même règle que l'API (`PHONE_PATTERN`) : chiffres, espaces, points ou tirets, + facultatif. */
const PHONE_PATTERN = /^\+?[0-9][0-9 .-]{5,18}$/;

export const optionalPhoneField = z
  .string()
  .trim()
  .refine((value) => value === '' || PHONE_PATTERN.test(value), {
    message:
      'Vérifiez le numéro : chiffres uniquement, avec l’indicatif si vous êtes à l’étranger.',
  });

export const CONTACT_SUBJECTS = [
  { value: 'general', label: 'Une question générale' },
  { value: 'catering', label: 'Une commande traiteur' },
  { value: 'courses', label: 'Les formations' },
  { value: 'shop', label: 'La boutique et les kits' },
  { value: 'partnership', label: 'Un partenariat' },
  { value: 'other', label: 'Autre chose' },
] as const;

type ContactSubject = (typeof CONTACT_SUBJECTS)[number]['value'];

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Indiquez votre nom.')
    .max(100, 'Votre nom est trop long (100 caractères au plus).'),
  email: emailField,
  phone: optionalPhoneField,
  subject: z.enum(
    CONTACT_SUBJECTS.map((subject) => subject.value) as [ContactSubject, ...ContactSubject[]],
    { message: 'Choisissez le sujet de votre message.' },
  ),
  message: z
    .string()
    .trim()
    .min(10, 'Votre message est un peu court : 10 caractères au moins.')
    .max(5000, 'Votre message est trop long : 5 000 caractères au plus.'),
  website: z.string(),
});

export type ContactValues = z.infer<typeof contactSchema>;
