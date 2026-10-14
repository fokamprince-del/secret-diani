/**
 * Messages et règles de saisie partagés, sans dépendance : importables depuis les composants
 * chargés sur toutes les pages (pied de page) sans alourdir le JavaScript commun.
 */
export const EMAIL_MESSAGES = {
  missing: 'Indiquez votre adresse e-mail.',
  tooLong: 'Cette adresse e-mail est trop longue.',
  invalid: 'Vérifiez l’adresse e-mail : elle doit ressembler à prenom@exemple.fr.',
} as const;

/** Contrôle de forme seulement : l'API reste seule juge de la validité. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Message d'erreur d'une adresse e-mail, ou `null` si elle a la bonne forme. */
export function emailError(value: string): string | null {
  const email = value.trim();
  if (!email) return EMAIL_MESSAGES.missing;
  if (email.length > 254) return EMAIL_MESSAGES.tooLong;
  return EMAIL_SHAPE.test(email) ? null : EMAIL_MESSAGES.invalid;
}

/** Texte de consentement exact enregistré par l'API comme preuve (ne pas reformuler). */
export const NEWSLETTER_CONSENT_TEXT =
  'J’accepte de recevoir par e-mail les nouvelles des Secrets de Diani (recettes, formations, nouveautés). Désinscription possible à tout moment, en un clic.';

export const NEWSLETTER_CONSENT_MISSING = 'Cochez la case pour confirmer votre inscription.';
