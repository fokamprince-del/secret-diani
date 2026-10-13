import { availability, availableQuantity, schemaAvailability } from './availability';
import { buildComparison } from './comparison';
import { csvCell, toCsv } from './csv';
import {
  canTransition,
  invoiceNumber,
  nextAdminStatuses,
  orderReference,
  parseOrderReference,
} from './order-status';
import { cartTotals, type RateRule, shippingOptions } from './pricing';

const RATES: RateRule[] = [
  {
    id: 'colissimo-leger',
    name: 'Colissimo',
    method: 'delivery',
    countries: ['FR'],
    minWeightGrams: 0,
    maxWeightGrams: 2_000,
    priceCents: 790,
    freeFromCents: 8_000,
    delay: '2 à 4 jours ouvrés',
  },
  {
    id: 'colissimo-lourd',
    name: 'Colissimo (plus de 2 kg)',
    method: 'delivery',
    countries: ['FR'],
    minWeightGrams: 2_001,
    maxWeightGrams: null,
    priceCents: 1_290,
    freeFromCents: null,
    delay: null,
  },
  {
    id: 'europe',
    name: 'Europe',
    method: 'delivery',
    countries: ['BE', 'LU'],
    minWeightGrams: 0,
    maxWeightGrams: null,
    priceCents: 1_490,
    freeFromCents: null,
    delay: null,
  },
  {
    id: 'retrait',
    name: 'Retrait',
    method: 'pickup',
    countries: [],
    minWeightGrams: 0,
    maxWeightGrams: null,
    priceCents: 0,
    freeFromCents: null,
    delay: null,
  },
];

describe('cartTotals', () => {
  it('additionne sous-total et poids des lignes', () => {
    expect(
      cartTotals([
        { unitPriceCents: 3_799, quantity: 2, weightGrams: 600 },
        { unitPriceCents: 590, quantity: 1, weightGrams: 80 },
      ]),
    ).toEqual({ subtotalCents: 8_188, weightGrams: 1_280 });
    expect(cartTotals([])).toEqual({ subtotalCents: 0, weightGrams: 0 });
  });
});

describe('shippingOptions', () => {
  it('propose le retrait et la tranche de poids du pays, triés par prix', () => {
    const options = shippingOptions(RATES, {
      country: 'FR',
      weightGrams: 1_200,
      subtotalCents: 3_799,
    });
    expect(options.map((option) => [option.id, option.priceCents])).toEqual([
      ['retrait', 0],
      ['colissimo-leger', 790],
    ]);
  });

  it('change de tranche au-delà du poids maximal (bornes incluses)', () => {
    expect(
      shippingOptions(RATES, { country: 'FR', weightGrams: 2_000, subtotalCents: 0 }).map(
        (o) => o.id,
      ),
    ).toContain('colissimo-leger');
    expect(
      shippingOptions(RATES, { country: 'FR', weightGrams: 2_001, subtotalCents: 0 }).map(
        (o) => o.id,
      ),
    ).toEqual(['retrait', 'colissimo-lourd']);
  });

  it('offre la livraison à partir du seuil', () => {
    const options = shippingOptions(RATES, {
      country: 'FR',
      weightGrams: 500,
      subtotalCents: 8_000,
    });
    // À prix égal, l'ordre défini par l'administration est conservé (tri stable).
    expect(options.map((option) => option.id)).toEqual(['colissimo-leger', 'retrait']);
    expect(options[0]).toMatchObject({ id: 'colissimo-leger', priceCents: 0, free: true });
  });

  it('sans pays ou vers un pays non desservi : retrait seulement', () => {
    expect(
      shippingOptions(RATES, { country: null, weightGrams: 100, subtotalCents: 0 }),
    ).toHaveLength(1);
    expect(
      shippingOptions(RATES, { country: 'US', weightGrams: 100, subtotalCents: 0 }).map(
        (o) => o.id,
      ),
    ).toEqual(['retrait']);
    expect(
      shippingOptions(RATES, { country: 'BE', weightGrams: 100, subtotalCents: 0 }).map(
        (o) => o.id,
      ),
    ).toEqual(['retrait', 'europe']);
  });
});

describe('disponibilité', () => {
  it('déduit les réservations du stock', () => {
    expect(availableQuantity({ onHand: 5, reserved: 2 })).toBe(3);
    expect(availableQuantity({ onHand: 1, reserved: 1 })).toBe(0);
    expect(availableQuantity(null)).toBe(0);
  });

  it('affiche « plus que N » sous le seuil seulement', () => {
    expect(availability(0, 5)).toEqual({ status: 'out_of_stock', remaining: 0 });
    expect(availability(2, 5)).toEqual({ status: 'low_stock', remaining: 2 });
    expect(availability(12, 5)).toEqual({ status: 'in_stock', remaining: null });
    expect(schemaAvailability('low_stock')).toBe('https://schema.org/LimitedAvailability');
  });
});

describe('statuts de commande', () => {
  it('« payée » et « remboursée » ne sont jamais choisis par l’administration', () => {
    expect(nextAdminStatuses('pending_payment')).toEqual(['cancelled']);
    expect(nextAdminStatuses('paid')).toEqual(['preparing', 'shipped']);
    expect(nextAdminStatuses('shipped')).toEqual(['delivered']);
    expect(nextAdminStatuses('delivered')).toEqual([]);
  });

  it('une commande payée ne s’annule pas (elle se rembourse)', () => {
    expect(canTransition('paid', 'cancelled')).toBe(false);
    expect(canTransition('paid', 'refunded')).toBe(true);
    expect(canTransition('cancelled', 'paid')).toBe(false);
    expect(canTransition('pending_payment', 'paid')).toBe(true);
  });

  it('formate les références et numéros de facture', () => {
    expect(orderReference(42)).toBe('CMD-000042');
    expect(parseOrderReference('cmd-000042')).toBe(42);
    expect(parseOrderReference('Awa')).toBeNull();
    expect(invoiceNumber(2026, 7)).toBe('F-2026-00007');
  });
});

describe('CSV', () => {
  it('neutralise les formules (injection CSV)', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+33 6 12')).toBe('"\'+33 6 12"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell(-12.5)).toBe('"-12.5"');
    expect(csvCell(null)).toBe('');
  });

  it('produit un fichier lisible par Excel (BOM, « ; », CRLF)', () => {
    const csv = toCsv(['Référence', 'Total'], [['CMD-000001', '42,00']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('"Référence";"Total"\r\n"CMD-000001";"42,00"\r\n');
  });
});

describe('buildComparison', () => {
  it('compare les kits par composition, du moins cher au plus cher', () => {
    const table = buildComparison([
      {
        slug: 'expert',
        name: 'Kit Expert',
        fromPriceCents: 5_999,
        items: [
          { label: 'Poche à douille', quantity: 2 },
          { label: 'Douilles', quantity: 12 },
          { label: 'Lisseur', quantity: 1 },
        ],
      },
      {
        slug: 'debutant',
        name: 'Kit Débutant',
        fromPriceCents: 3_799,
        items: [
          { label: 'poche  à douille', quantity: 1 },
          { label: 'Douilles', quantity: 6 },
        ],
      },
    ]);
    expect(table.kits.map((kit) => kit.slug)).toEqual(['debutant', 'expert']);
    expect(table.rows).toEqual([
      { label: 'poche  à douille', values: [1, 2] },
      { label: 'Douilles', values: [6, 12] },
      { label: 'Lisseur', values: [null, 1] },
    ]);
  });
});
