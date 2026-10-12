/** Données attendues par chaque gabarit d'e-mail (les liens sont construits côté API). */
export interface MailTemplateData {
  'verify-email': { firstName: string | null; link: string };
  welcome: { firstName: string | null; siteLink: string };
  'account-exists': { loginLink: string; resetLink: string };
  'password-reset': { firstName: string | null; link: string; expiresInMinutes: number };
  'password-changed': { firstName: string | null; resetLink: string };
  'email-change-confirm': { link: string; expiresInMinutes: number };
  'email-change-notice': { firstName: string | null };
  'admin-login-alert': { at: string; ipTruncated: string | null; userAgent: string | null };
  'account-deleted': { firstName: string | null };
}

export type MailTemplate = keyof MailTemplateData;

export type MailJob = {
  [T in MailTemplate]: { template: T; to: string; data: MailTemplateData[T] };
}[MailTemplate];

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}
