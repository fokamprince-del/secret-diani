export interface OutgoingMail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Pièces jointes (facture PDF…). */
  attachments?: { filename: string; content: Buffer }[];
  /** Clé d'idempotence transmise au prestataire (identifiant du job) : pas de doublon en cas de relance. */
  idempotencyKey: string;
}

export interface MailTransport {
  send(mail: OutgoingMail): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** Erreur définitive (requête refusée par le prestataire) : inutile de relancer. */
export class PermanentMailError extends Error {}
