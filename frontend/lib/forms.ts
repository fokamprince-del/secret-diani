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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Demande traiteur. `minDate` (AAAA-MM-JJ) applique le délai de préparation réglé dans
 * l'administration ; l'API le revérifie.
 */
export function cateringRequestSchema(minDate: string, minDateLabel: string) {
  return z
    .object({
      firstName: z
        .string()
        .trim()
        .min(1, 'Indiquez votre prénom.')
        .max(100, 'Votre prénom est trop long (100 caractères au plus).'),
      lastName: z.string().trim().max(100, 'Votre nom est trop long (100 caractères au plus).'),
      email: emailField,
      phone: optionalPhoneField,
      eventDate: z
        .string()
        .regex(DATE_PATTERN, 'Indiquez la date de votre événement.')
        .refine((value) => value >= minDate, {
          message: `Choisissez une date à partir du ${minDateLabel} : Diani a besoin de ce délai pour tout préparer.`,
        }),
      guestCount: z
        .string()
        .trim()
        .refine((value) => value === '' || (/^\d+$/.test(value) && +value >= 1 && +value <= 5000), {
          message: 'Indiquez un nombre d’invités entre 1 et 5 000, ou laissez vide.',
        }),
      fulfilment: z.enum(['pickup', 'delivery'], { message: 'Choisissez retrait ou livraison.' }),
      deliveryAddress: z
        .string()
        .trim()
        .max(300, 'L’adresse est trop longue (300 caractères au plus).'),
      message: z
        .string()
        .trim()
        .max(3000, 'Votre message est trop long : 3 000 caractères au plus.'),
      slotId: z.string(),
      website: z.string(),
    })
    .superRefine((values, context) => {
      if (values.fulfilment === 'delivery' && values.deliveryAddress === '') {
        context.addIssue({
          code: 'custom',
          path: ['deliveryAddress'],
          message: 'Indiquez la ville ou l’adresse de livraison.',
        });
      }
    });
}

export type CateringRequestValues = z.infer<ReturnType<typeof cateringRequestSchema>>;
