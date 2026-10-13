import { renderInvoicePdf } from './invoice-pdf';

describe('renderInvoicePdf', () => {
  it('produit un PDF A4 à partir de la facture figée', async () => {
    const pdf = await renderInvoicePdf({
      number: 'F-2026-00001',
      issuedAt: new Date('2026-10-13T10:00:00Z'),
      orderReference: 'CMD-000042',
      seller: {
        name: 'Les Secrets de Diani',
        lines: ['Micro-entreprise', '1 rue des Lilas, 94000 Créteil'],
        siret: '12345678900012',
        email: 'contact@example.com',
      },
      buyer: { name: 'Awa Diallo', lines: ['2 avenue des Roses', '75011 Paris', 'FR'] },
      lines: [
        { description: 'Kit Débutant (Standard)', quantity: 2, unitPriceCents: 3_799 },
        {
          description: 'Poche à douille réutilisable — lot de 3 (Standard)',
          quantity: 1,
          unitPriceCents: 590,
        },
      ],
      subtotalCents: 8_188,
      shippingCents: 0,
      shippingLabel: 'Livraison : Colissimo',
      totalCents: 8_188,
      vatMention: 'TVA non applicable, art. 293 B du CGI',
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(1_500);
    expect(pdf.length).toBeLessThan(200_000);
  });
});
