import { PDFDocument } from '@cantoo/pdf-lib';
import { renderCertificatePdf } from './certificates/certificate-pdf';
import { stampPdf, watermarkText } from './resources/watermark.service';

describe('certificat PDF', () => {
  it('produit un A4 paysage', async () => {
    const pdf = await renderCertificatePdf({
      number: 'DIANI-2026-7K3QF9XA',
      holderName: 'Awa Diallo',
      courseTitle: 'Crème au beurre lisse et stable',
      issuedAt: new Date('2026-10-13T10:00:00Z'),
      brand: 'Les Secrets de Diani',
      verificationUrl: 'https://site.fr/certificat/DIANI-2026-7K3QF9XA',
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
  });
});

describe('filigrane des fiches', () => {
  it('nomme la cliente, ou à défaut son e-mail', () => {
    expect(watermarkText({ firstName: 'Awa', lastName: 'Diallo', email: 'awa@example.com' })).toBe(
      'Awa Diallo — awa@example.com',
    );
    expect(watermarkText({ firstName: null, lastName: null, email: 'awa@example.com' })).toBe(
      'awa@example.com',
    );
  });

  it('appose le filigrane sur chaque page sans en changer le nombre', async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    source.addPage([595, 842]);
    const original = Buffer.from(await source.save());
    const stamped = await stampPdf(original, 'Awa Diallo — awa@example.com');
    const doc = await PDFDocument.load(stamped);
    expect(doc.getPageCount()).toBe(2);
    expect(stamped.length).toBeGreaterThan(original.length);
  });

  it('refuse un fichier qui n’est pas un PDF', async () => {
    await expect(stampPdf(Buffer.from('pas un pdf'), 'x')).rejects.toThrow();
  });
});
