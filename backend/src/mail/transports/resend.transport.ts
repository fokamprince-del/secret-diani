import { type MailTransport, type OutgoingMail, PermanentMailError } from './mail-transport';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Envoi via l'API HTTP de Resend (adresse fixe : aucune URL fournie par l'utilisateur, pas de SSRF). */
export class ResendTransport implements MailTransport {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(mail: OutgoingMail): Promise<void> {
    const response = await this.fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': mail.idempotencyKey,
      },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        ...(mail.headers ? { headers: mail.headers } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return;
    // 429 et 5xx : temporaire, BullMQ relance. Autres 4xx : la requête ne passera jamais.
    const message = `Resend a répondu ${response.status}`;
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw new PermanentMailError(message);
    }
    throw new Error(message);
  }
}
