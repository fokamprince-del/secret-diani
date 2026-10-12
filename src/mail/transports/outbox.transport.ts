import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MailTransport, OutgoingMail } from './mail-transport';

/**
 * Développement uniquement (interdit en production par la configuration) :
 * chaque e-mail est écrit dans un dossier local (`.html` + `.txt`) au lieu d'être envoyé.
 */
export class OutboxTransport implements MailTransport {
  constructor(private readonly directory: string) {}

  async send(mail: OutgoingMail): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const base = join(this.directory, `${Date.now()}-${mail.idempotencyKey.replace(/\W/g, '_')}`);
    const header = `De : ${mail.from}\nÀ : ${mail.to}\nObjet : ${mail.subject}\n\n`;
    await writeFile(`${base}.txt`, header + mail.text, 'utf8');
    await writeFile(`${base}.html`, mail.html, 'utf8');
  }
}
