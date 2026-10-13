import PDFDocument from 'pdfkit';
import { formatEuros } from '../../common/utils/money';

export interface InvoiceParty {
  name: string;
  lines: string[];
}

export interface InvoicePdfInput {
  number: string;
  issuedAt: Date;
  orderReference: string;
  seller: InvoiceParty & { siret: string; email: string };
  buyer: InvoiceParty;
  lines: { description: string; quantity: number; unitPriceCents: number }[];
  subtotalCents: number;
  shippingCents: number;
  /** Ligne de livraison ; null pour un contenu numérique (pack de formation). */
  shippingLabel: string | null;
  totalCents: number;
  vatMention: string;
}

const BROWN = '#5E2F1B';
const TEXT = '#5A504A';
const MUTED = '#7A6B63';
const LINE = '#DAB6AA';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(
    date,
  );
}

/**
 * Facture PDF (A4), polices standard PDF (Helvetica : accents et symbole euro inclus, aucun
 * fichier de police à embarquer). Toutes les données viennent de la facture figée en base.
 */
export function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Facture ${input.number}`, Author: input.seller.name },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    doc.fillColor(BROWN).font('Helvetica-Bold').fontSize(20).text(input.seller.name, left, 50);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    for (const line of input.seller.lines) doc.text(line);
    if (input.seller.siret) doc.text(`SIRET : ${input.seller.siret}`);
    if (input.seller.email) doc.text(input.seller.email);

    doc
      .fillColor(BROWN)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(`Facture ${input.number}`, left, 50, {
        width,
        align: 'right',
      });
    doc.font('Helvetica').fontSize(9).fillColor(TEXT);
    doc.text(`Date : ${formatDate(input.issuedAt)}`, { width, align: 'right' });
    doc.text(`Commande : ${input.orderReference}`, { width, align: 'right' });

    doc.moveDown(4);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BROWN).text('Facturé à', left);
    doc.font('Helvetica').fillColor(TEXT).text(input.buyer.name);
    for (const line of input.buyer.lines) doc.text(line);

    // Tableau des lignes.
    doc.moveDown(2);
    const columns = {
      description: left,
      quantity: left + width * 0.6,
      unit: left + width * 0.7,
      total: left + width * 0.85,
    };
    const header = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BROWN);
    doc.text('Désignation', columns.description, header);
    doc.text('Qté', columns.quantity, header);
    doc.text('Prix unitaire', columns.unit, header);
    doc.text('Total', columns.total, header, { width: width * 0.15, align: 'right' });
    doc
      .moveTo(left, doc.y + 4)
      .lineTo(left + width, doc.y + 4)
      .strokeColor(LINE)
      .stroke();
    doc.moveDown(0.8);

    doc.font('Helvetica').fillColor(TEXT);
    const row = (label: string, quantity: string, unit: string, total: string): void => {
      const y = doc.y;
      doc.text(label, columns.description, y, { width: width * 0.58 });
      const after = doc.y;
      doc.text(quantity, columns.quantity, y);
      doc.text(unit, columns.unit, y);
      doc.text(total, columns.total, y, { width: width * 0.15, align: 'right' });
      doc.y = Math.max(after, doc.y) + 4;
    };
    for (const line of input.lines) {
      row(
        line.description,
        String(line.quantity),
        formatEuros(line.unitPriceCents),
        formatEuros(line.unitPriceCents * line.quantity),
      );
    }
    if (input.shippingLabel) {
      row(
        input.shippingLabel,
        '1',
        formatEuros(input.shippingCents),
        formatEuros(input.shippingCents),
      );
    }

    doc
      .moveTo(left, doc.y + 2)
      .lineTo(left + width, doc.y + 2)
      .strokeColor(LINE)
      .stroke();
    doc.moveDown(1);
    const totals = (label: string, value: string, bold = false): void => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? BROWN : TEXT);
      doc.text(label, columns.unit - 40, y);
      doc.text(value, columns.total, y, { width: width * 0.15, align: 'right' });
      doc.moveDown(0.3);
    };
    totals('Sous-total', formatEuros(input.subtotalCents));
    totals('Livraison', formatEuros(input.shippingCents));
    totals('Total TTC', formatEuros(input.totalCents), true);

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(input.vatMention, left, doc.y, { width });
    doc.text('Facture acquittée : paiement reçu à la commande.', { width });
    doc.end();
  });
}
