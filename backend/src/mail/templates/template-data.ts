/** Données attendues par chaque gabarit d'e-mail (les liens sont construits côté API). */
export interface MailTemplateData {
  'verify-email': { firstName: string | null; link: string };
  welcome: { firstName: string | null; siteLink: string };
  'account-exists': { loginLink: string; resetLink: string };
  'password-reset': {
    firstName: string | null;
    link: string;
    /** Code à 6 chiffres, à saisir sur le site (alternative au lien). */
    code: string;
    codeExpiresInMinutes: number;
    expiresInMinutes: number;
  };
  'password-changed': { firstName: string | null; resetLink: string };
  'email-change-confirm': { link: string; expiresInMinutes: number };
  'email-change-notice': { firstName: string | null };
  'admin-login-alert': { at: string; ipTruncated: string | null; userAgent: string | null };
  'account-deleted': { firstName: string | null };
  /** Action de l'administration sur la sécurité du compte (phase 9). */
  'account-security-changed': {
    firstName: string | null;
    change: 'locked' | 'unlocked' | 'mfa_reset' | 'sessions_revoked';
  };
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
    /** Lignes de la commande : libellé (quantité × article) et montant. */
    items: { label: string; amount: string }[];
    subtotal: string;
    shipping: string;
    total: string;
    deliveryLine: string;
    trackingLink: string;
    /** Espace membre, quand la commande contient un pack de formation. */
    coursesLink?: string | null;
    /** Facture à joindre (le worker joint le PDF au moment de l'envoi). */
    invoiceId?: string | null;
    /** Posé par le worker : le PDF est bien joint. */
    invoiceAttached?: boolean;
  };
  'order-shipped': {
    firstName: string;
    reference: string;
    carrier: string | null;
    trackingNumber: string | null;
    trackingLink: string;
  };
  'stock-low': { lines: string[] };
  // Paiements (phase 6)
  'order-refunded': {
    firstName: string;
    reference: string;
    amount: string;
    reason: string;
    full: boolean;
    trackingLink: string;
  };
  'payment-alert': { title: string; lines: string[] };
  // Formations (phase 7)
  'course-access-granted': { firstName: string | null; packName: string; link: string };
  'course-completed': {
    firstName: string | null;
    courseTitle: string;
    /** Null : nom et prénom à compléter avant l'émission du certificat. */
    certificateNumber: string | null;
    link: string;
  };
  'call-request-admin': { customerName: string; email: string; message: string; remaining: number };
  // Contact et newsletter (phase 8)
  'contact-admin': {
    name: string;
    email: string;
    phone: string | null;
    subject: string;
    message: string;
  };
  'contact-ack': { name: string; subject: string };
  'newsletter-confirm': {
    confirmLink: string;
    unsubscribeLink: string;
    oneClickUrl: string | null;
  };
  'newsletter-welcome': { unsubscribeLink: string; oneClickUrl: string | null };
}

export type MailTemplate = keyof MailTemplateData;

export type MailJob = {
  [T in MailTemplate]: { template: T; to: string; data: MailTemplateData[T] };
}[MailTemplate];

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
  /** En-têtes propres au message (List-Unsubscribe…). */
  headers?: Record<string, string>;
  /** Adresse de réponse propre au message (ex. la personne qui a écrit). */
  replyTo?: string;
}
