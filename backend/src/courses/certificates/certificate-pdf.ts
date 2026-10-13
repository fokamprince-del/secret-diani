import PDFDocument from 'pdfkit';

export interface CertificatePdfInput {
  number: string;
  holderName: string;
  courseTitle: string;
  issuedAt: Date;
  brand: string;
  verificationUrl: string;
}

const BROWN = '#5E2F1B';
const TERRA = '#9B6155';
const TEXT = '#5A504A';
const GOLD = '#B8935A';
const CREAM = '#F9EEE8';

/** Certificat A4 paysage, aux couleurs de la marque (polices PDF standard). */
export function renderCertificatePdf(input: CertificatePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 60,
      info: { Title: `Certificat ${input.number}`, Author: input.brand },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { width, height } = doc.page;
    doc.rect(0, 0, width, height).fill(CREAM);
    doc
      .lineWidth(1.5)
      .rect(30, 30, width - 60, height - 60)
      .stroke(GOLD);
    const inner = { x: 60, width: width - 120 };
    const date = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long',
      timeZone: 'Europe/Paris',
    }).format(input.issuedAt);

    doc
      .fillColor(TERRA)
      .font('Helvetica')
      .fontSize(14)
      .text(input.brand, inner.x, 90, { width: inner.width, align: 'center' });
    doc
      .fillColor(BROWN)
      .font('Helvetica-Bold')
      .fontSize(34)
      .text('Certificat de réussite', { width: inner.width, align: 'center' });
    doc.moveDown(1.5);
    doc
      .fillColor(TEXT)
      .font('Helvetica')
      .fontSize(14)
      .text('décerné à', { width: inner.width, align: 'center' });
    doc.moveDown(0.6);
    doc
      .fillColor(BROWN)
      .font('Helvetica-Bold')
      .fontSize(28)
      .text(input.holderName, { width: inner.width, align: 'center' });
    doc.moveDown(0.8);
    doc
      .fillColor(TEXT)
      .font('Helvetica')
      .fontSize(14)
      .text('pour avoir suivi avec succès la formation', { width: inner.width, align: 'center' });
    doc.moveDown(0.5);
    doc
      .fillColor(TERRA)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(`« ${input.courseTitle} »`, { width: inner.width, align: 'center' });
    doc.moveDown(1.5);
    doc
      .fillColor(TEXT)
      .font('Helvetica')
      .fontSize(12)
      .text(`Le ${date}`, { width: inner.width, align: 'center' });

    doc
      .fontSize(9)
      .fillColor(TEXT)
      .text(
        `Certificat n° ${input.number} — vérifiable sur ${input.verificationUrl}`,
        inner.x,
        height - 80,
        { width: inner.width, align: 'center' },
      );
    doc.end();
  });
}
