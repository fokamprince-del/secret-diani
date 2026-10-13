import { escapeHtml } from './layout';
import { renderMail } from './render';
import type { MailJob } from './template-data';

const JOBS: Pick<MailJob, 'template' | 'data'>[] = [
  {
    template: 'verify-email',
    data: { firstName: 'Awa', link: 'https://site.fr/verifier-email?token=abc' },
  },
  { template: 'welcome', data: { firstName: null, siteLink: 'https://site.fr/' } },
  {
    template: 'account-exists',
    data: {
      loginLink: 'https://site.fr/connexion',
      resetLink: 'https://site.fr/mot-de-passe-oublie',
    },
  },
  {
    template: 'password-reset',
    data: {
      firstName: 'Awa',
      link: 'https://site.fr/reinitialiser?token=abc',
      expiresInMinutes: 30,
    },
  },
  { template: 'password-changed', data: { firstName: null, resetLink: 'https://site.fr/x' } },
  {
    template: 'email-change-confirm',
    data: { link: 'https://site.fr/c?token=t', expiresInMinutes: 60 },
  },
  { template: 'email-change-notice', data: { firstName: 'Awa' } },
  {
    template: 'admin-login-alert',
    data: { at: 'lundi', ipTruncated: '203.0.113.0/24', userAgent: null },
  },
  { template: 'account-deleted', data: { firstName: null } },
  {
    template: 'catering-request-received',
    data: {
      firstName: 'Awa',
      reference: 'TR-000042',
      eventDate: 'samedi 14 novembre 2026',
      itemLines: ['– 2 × Plateau découverte (Plateau) : 80,00 €'],
      estimatedTotal: '80,00 €',
      conditions: ['Le solde est réglé au retrait ou à la livraison.'],
    },
  },
  {
    template: 'catering-request-admin',
    data: {
      reference: 'TR-000042',
      source: 'formulaire du site',
      customerName: 'Awa Diallo',
      email: 'awa@example.com',
      phone: null,
      eventDate: 'samedi 14 novembre 2026',
      guestCount: 40,
      fulfilment: 'livraison',
      itemLines: [],
      estimatedTotal: null,
      message: 'Anniversaire de ma fille',
    },
  },
  {
    template: 'catering-order-confirmed',
    data: {
      firstName: 'Awa',
      reference: 'TR-000042',
      eventDate: 'samedi 14 novembre 2026',
      total: '90,00 €',
      deposit: '20,00 €',
      balance: '70,00 €',
      conditions: ['L’acompte n’est pas remboursable en cas d’annulation de votre part.'],
    },
  },
  {
    template: 'order-confirmed',
    data: {
      firstName: 'Awa',
      reference: 'CMD-000042',
      itemLines: ['1 × Kit Débutant (Standard) : 37,99 €'],
      subtotal: '37,99 €',
      shipping: '7,90 €',
      total: '45,89 €',
      deliveryLine: 'Livraison Colissimo : Awa Diallo, 1 rue des Lilas, 94000 Créteil',
      trackingLink: 'https://site.fr/commande/suivi?token=abc',
    },
  },
  {
    template: 'order-shipped',
    data: {
      firstName: 'Awa',
      reference: 'CMD-000042',
      carrier: 'Colissimo',
      trackingNumber: '6A12345678901',
      trackingLink: 'https://site.fr/commande/suivi?token=abc',
    },
  },
  {
    template: 'stock-low',
    data: { lines: ['Kit Débutant (Standard, KIT-DEBUTANT) : 2 disponible(s)'] },
  },
  {
    template: 'order-refunded',
    data: {
      firstName: 'Awa',
      reference: 'CMD-000042',
      amount: '45,89 €',
      reason: 'Article épuisé pendant le paiement',
      full: true,
      trackingLink: 'https://site.fr/commande/suivi?token=abc',
    },
  },
  {
    template: 'payment-alert',
    data: { title: 'litige ouvert', lines: ['Commande CMD-000042 : litige de 45,89 € (Stripe).'] },
  },
  {
    template: 'course-access-granted',
    data: { firstName: 'Awa', packName: 'Premium', link: 'https://site.fr/espace-membre' },
  },
  {
    template: 'course-completed',
    data: {
      firstName: 'Awa',
      courseTitle: 'Crème au beurre parfaite',
      certificateNumber: 'DIANI-2026-7K3QF9XA',
      link: 'https://site.fr/espace-membre/certificats',
    },
  },
  {
    template: 'call-request-admin',
    data: {
      customerName: 'Awa Diallo',
      email: 'awa@example.com',
      message: 'Mardi soir',
      remaining: 2,
    },
  },
];

describe('renderMail', () => {
  it.each(JOBS.map((job) => [job.template, job] as const))(
    '%s : objet, HTML et texte en français',
    (_template, job) => {
      const mail = renderMail(job);
      expect(mail.subject.length).toBeGreaterThan(5);
      expect(mail.html).toContain('<html lang="fr">');
      expect(mail.text).toContain('Les Secrets de Diani');
      for (const value of Object.values(job.data)) {
        if (typeof value === 'string' && value.startsWith('https://')) {
          expect(mail.text).toContain(value);
          expect(mail.html).toContain(escapeHtml(value));
        }
      }
    },
  );

  it('échappe les données utilisateur (aucune injection HTML)', () => {
    const mail = renderMail({
      template: 'welcome',
      data: { firstName: '<script>alert(1)</script>', siteLink: 'https://site.fr/?a=1&b="2"' },
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('https://site.fr/?a=1&amp;b=&quot;2&quot;');
  });
});
