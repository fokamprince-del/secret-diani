import { z } from 'zod';
import { EMAIL_MESSAGES } from './form-messages';

// La CSP interdit `eval` : sans ce réglage, Zod teste `new Function()` au chargement et le
// navigateur signale une violation (sans effet, mais visible dans Lighthouse et la console).
z.config({ jitless: true });

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

export const PASSWORD_MIN_LENGTH = 12;

const newPasswordField = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Choisissez un mot de passe d’au moins ${PASSWORD_MIN_LENGTH} caractères.`,
  )
  .max(128, 'Ce mot de passe est trop long (128 caractères au plus).');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Indiquez votre mot de passe.'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Indiquez votre prénom.').max(100, 'Prénom trop long.'),
  lastName: z.string().trim().max(100, 'Nom trop long.'),
  email: emailField,
  password: newPasswordField,
  acceptTerms: z.boolean().refine((value) => value, {
    message: 'Acceptez les conditions pour créer votre compte.',
  }),
  marketingConsent: z.boolean(),
});
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({ email: emailField });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const resetCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Saisissez les 6 chiffres reçus par e-mail.'),
});
export type ResetCodeValues = z.infer<typeof resetCodeSchema>;

export const newPasswordSchema = z
  .object({ password: newPasswordField, confirmation: z.string() })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'Les deux mots de passe ne sont pas identiques.',
  });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Indiquez votre mot de passe actuel.'),
    password: newPasswordField,
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'Les deux mots de passe ne sont pas identiques.',
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const mfaCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Saisissez les 6 chiffres affichés par votre application.'),
});
export type MfaCodeValues = z.infer<typeof mfaCodeSchema>;

const addressFields = {
  line1: z.string().trim(),
  line2: z.string().trim().max(200, 'Complément trop long.'),
  postalCode: z.string().trim(),
  city: z.string().trim(),
  country: z.string().length(2),
};

function checkAddress(
  prefix: 'shipping' | 'billing',
  address: { line1: string; postalCode: string; city: string },
  context: z.RefinementCtx,
) {
  if (address.line1.length < 3) {
    context.addIssue({ code: 'custom', path: [prefix, 'line1'], message: 'Indiquez l’adresse.' });
  }
  if (!/^[A-Za-z0-9 -]{3,10}$/.test(address.postalCode)) {
    context.addIssue({
      code: 'custom',
      path: [prefix, 'postalCode'],
      message: 'Vérifiez le code postal.',
    });
  }
  if (address.city.length < 1) {
    context.addIssue({ code: 'custom', path: [prefix, 'city'], message: 'Indiquez la ville.' });
  }
}

/**
 * Commande de la boutique. `guest` : l'e-mail est demandé (sans compte) ; `deliveryIds` : options
 * de livraison qui exigent une adresse. Pour un retrait, l'adresse de facturation est demandée.
 */
export function checkoutSchema(guest: boolean, deliveryIds: string[]) {
  return z
    .object({
      email: guest ? emailField : z.string(),
      firstName: z.string().trim().min(1, 'Indiquez votre prénom.').max(100, 'Prénom trop long.'),
      lastName: z.string().trim().min(1, 'Indiquez votre nom.').max(100, 'Nom trop long.'),
      phone: optionalPhoneField,
      shippingRateId: z.string().min(1, 'Choisissez un mode de livraison.'),
      shipping: z.object(addressFields),
      billingSame: z.boolean(),
      billing: z.object({
        firstName: z.string().trim(),
        lastName: z.string().trim(),
        ...addressFields,
      }),
      note: z.string().trim().max(1000, 'Votre message est trop long (1 000 caractères au plus).'),
      acceptTerms: z.boolean().refine((value) => value, {
        message: 'Acceptez les conditions générales de vente pour commander.',
      }),
      provider: z.enum(['stripe', 'paypal'], { message: 'Choisissez un moyen de paiement.' }),
    })
    .superRefine((values, context) => {
      const delivery = deliveryIds.includes(values.shippingRateId);
      if (delivery) checkAddress('shipping', values.shipping, context);
      if (!delivery || !values.billingSame) {
        checkAddress('billing', values.billing, context);
        if (!values.billing.firstName || !values.billing.lastName) {
          context.addIssue({
            code: 'custom',
            path: ['billing', 'lastName'],
            message: 'Indiquez le nom pour la facture.',
          });
        }
      }
    });
}

export type CheckoutValues = z.infer<ReturnType<typeof checkoutSchema>>;
