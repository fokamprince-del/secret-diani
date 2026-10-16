import type { Job } from 'bullmq';
import type { AppConfigService } from '../config/app-config.service';
import { AttachmentNotReady, type MailAttachmentsService } from './mail-attachments.service';
import { MailProcessor } from './mail.processor';
import type { MailJob } from './templates/template-data';
import type { MailTransport, OutgoingMail } from './transports/mail-transport';

const ORDER: MailJob = {
  template: 'order-confirmed',
  to: 'awa@example.com',
  data: {
    firstName: 'Awa',
    reference: 'CMD-000042',
    items: [{ label: '1 × Pack Essentiel (Formation en ligne)', amount: '29,99 €' }],
    subtotal: '29,99 €',
    shipping: 'offerte',
    total: '29,99 €',
    deliveryLine: 'Formation en ligne',
    trackingLink: 'https://site.fr/commande/suivi?token=abc',
    coursesLink: 'https://site.fr/espace-membre/formations',
    invoiceId: 'facture-1',
  },
};

function setup(invoice: () => Promise<{ filename: string; content: Buffer }>) {
  const sent: OutgoingMail[] = [];
  const transport: MailTransport = {
    send: (mail) => {
      sent.push(mail);
      return Promise.resolve();
    },
  };
  const config = { get: (key: string) => (key === 'MAIL_FROM' ? 'Diani <x@site.fr>' : undefined) };
  const processor = new MailProcessor(
    transport,
    config as unknown as AppConfigService,
    { invoice } as unknown as MailAttachmentsService,
  );
  const job = (attemptsMade: number) =>
    ({ id: '7', name: 'order-confirmed', data: ORDER, attemptsMade }) as unknown as Job<MailJob>;
  return { processor, sent, job };
}

describe('MailProcessor : facture jointe à la confirmation de commande', () => {
  it('joint le PDF et l’annonce dans l’e-mail', async () => {
    const pdf = Buffer.from('%PDF-1.7');
    const { processor, sent, job } = setup(() =>
      Promise.resolve({ filename: 'facture-F-2026-00001.pdf', content: pdf }),
    );
    await processor.process(job(0));
    expect(sent[0]?.attachments).toEqual([{ filename: 'facture-F-2026-00001.pdf', content: pdf }]);
    expect(sent[0]?.text).toMatch(/facture est jointe/);
    expect(sent[0]?.subject).toMatch(/Bienvenue dans votre formation/);
  });

  it('facture pas encore prête : relance tant qu’il reste des essais', async () => {
    const { processor, sent, job } = setup(() =>
      Promise.reject(new AttachmentNotReady('en préparation')),
    );
    await expect(processor.process(job(0))).rejects.toBeInstanceOf(AttachmentNotReady);
    expect(sent).toHaveLength(0);
  });

  it('toujours pas prête après 3 essais : e-mail envoyé sans pièce jointe, avec le lien', async () => {
    const { processor, sent, job } = setup(() =>
      Promise.reject(new AttachmentNotReady('en préparation')),
    );
    await processor.process(job(3));
    expect(sent[0]?.attachments).toBeUndefined();
    expect(sent[0]?.text).toMatch(/disponible depuis le suivi/);
  });
});
