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
  // Traiteur (phase 4)
  'catering-request-received': {
    firstName: string;
    reference: string;
    eventDate: string;
    itemLines: string[];
    estimatedTotal: string | null;
    conditions: string[];
  };
  'catering-request-admin': {
    reference: string;
    source: string;
    customerName: string;
    email: string;
    phone: string | null;
    eventDate: string;
    guestCount: number | null;
    fulfilment: string | null;
    itemLines: string[];
    estimatedTotal: string | null;
    message: string | null;
  };
  'catering-order-confirmed': {
    firstName: string;
    reference: string;
    eventDate: string;
    total: string;
    deposit: string;
    balance: string;
    conditions: string[];
  };
  // Boutique (phase 5)
  'order-confirmed': {
    firstName: string;
    reference: string;
    itemLines: string[];
    subtotal: string;
    shipping: string;
    total: string;
    deliveryLine: string;
    trackingLink: string;
  };
  'order-shipped': {
    firstName: string;
    reference: string;
    carrier: string | null;
    trackingNumber: string | null;
    trackingLink: string;
  };
  'stock-low': { lines: string[] };
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
