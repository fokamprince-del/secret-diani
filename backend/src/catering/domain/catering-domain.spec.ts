import { computeDeposit, type DepositRule, depositSentence } from './deposit';
import { buildRecap, type RecapInput } from './recap';
import {
  canTransition,
  isFinal,
  nextStatuses,
  parseReference,
  requestReference,
} from './request-status';
import { normalizeWhatsappNumber, productMessage, whatsappUrl } from './whatsapp';

const RULE: DepositRule = { thresholdCents: 5_000, belowCents: 1_000, fromCents: 2_000 };

describe('computeDeposit', () => {
  it.each([
    [1_500, 1_000],
    [4_999, 1_000],
    [5_000, 2_000],
    [5_001, 2_000],
    [9_000, 2_000],
  ])('total %i centimes → acompte %i', (total, deposit) => {
    expect(computeDeposit(total, RULE)).toBe(deposit);
  });

  it('ne dépasse jamais le total', () => {
    expect(computeDeposit(800, RULE)).toBe(800);
    expect(computeDeposit(0, RULE)).toBe(0);
  });

  it('refuse un total négatif ou non entier', () => {
    expect(() => computeDeposit(-1, RULE)).toThrow(RangeError);
    expect(() => computeDeposit(10.5, RULE)).toThrow(RangeError);
  });

  it('suit les montants paramétrés', () => {
    expect(
      computeDeposit(6_000, { thresholdCents: 8_000, belowCents: 1_500, fromCents: 3_000 }),
    ).toBe(1_500);
  });

  it('formule la condition à partir des montants', () => {
    expect(depositSentence(RULE)).toBe(
      'Un acompte de 10,00 € est demandé pour une commande de moins de 50,00 €, de 20,00 € à partir de 50,00 €.',
    );
  });
});

describe('cycle de vie d’une demande', () => {
  it('impose l’acompte avant la confirmation', () => {
    expect(canTransition('new', 'confirmed')).toBe(false);
    expect(canTransition('contacted', 'confirmed')).toBe(false);
    expect(canTransition('deposit_received', 'confirmed')).toBe(true);
  });

  it('suit l’ordre nouvelle → contactée → acompte → confirmée → livrée', () => {
    expect(canTransition('new', 'contacted')).toBe(true);
    expect(canTransition('contacted', 'deposit_received')).toBe(true);
    expect(canTransition('confirmed', 'delivered')).toBe(true);
    expect(canTransition('confirmed', 'contacted')).toBe(false);
    expect(canTransition('deposit_received', 'new')).toBe(false);
  });

  it('permet l’annulation jusqu’à la livraison, pas après', () => {
    for (const status of ['new', 'contacted', 'deposit_received', 'confirmed'] as const) {
      expect(canTransition(status, 'cancelled')).toBe(true);
    }
    expect(nextStatuses('delivered')).toEqual([]);
    expect(isFinal('cancelled')).toBe(true);
    expect(isFinal('confirmed')).toBe(false);
  });

  it('formate et relit les références', () => {
    expect(requestReference(42)).toBe('TR-000042');
    expect(parseReference('TR-000042')).toBe(42);
    expect(parseReference('tr42')).toBe(42);
    expect(parseReference(' 42 ')).toBe(42);
    expect(parseReference('marie@example.com')).toBeNull();
  });
});

describe('WhatsApp', () => {
  it('normalise un numéro international', () => {
    expect(normalizeWhatsappNumber('+33 6 12 34 56 78')).toBe('33612345678');
    expect(normalizeWhatsappNumber('0033612345678')).toBe('33612345678');
  });

  it('refuse un numéro sans indicatif ou vide', () => {
    expect(normalizeWhatsappNumber('06 12 34 56 78')).toBeNull();
    expect(normalizeWhatsappNumber('')).toBeNull();
    expect(whatsappUrl('', 'Bonjour')).toBeNull();
  });

  it('encode le message pré-rempli', () => {
    const url = whatsappUrl('+33612345678', productMessage('Plateau découverte', 'Plateau'));
    expect(url).toMatch(/^https:\/\/wa\.me\/33612345678\?text=/);
    expect(decodeURIComponent(url!.split('text=')[1]!)).toBe(
      'Bonjour Diani, je souhaite commander : Plateau découverte (Plateau). Pouvez-vous me donner vos disponibilités ?',
    );
  });
});

describe('buildRecap', () => {
  const base: RecapInput = {
    number: 7,
    status: 'contacted',
    firstName: 'Awa',
    lastName: 'Diallo',
    eventDate: new Date('2026-10-24T00:00:00Z'),
    guestCount: 40,
    fulfilment: 'delivery',
    deliveryAddress: 'Créteil',
    estimatedTotalCents: 8_200,
    agreedTotalCents: null,
    depositCents: null,
    depositReceivedAt: null,
    items: [
      {
        productName: 'Plateau découverte',
        variantLabel: 'Plateau de 20 pièces',
        quantity: 2,
        unitPriceCents: 4_000,
        flavours: [],
      },
      {
        productName: 'Layer cake',
        variantLabel: 'Bento',
        quantity: 1,
        unitPriceCents: 1_500,
        flavours: ['Vanille', 'Fraise'],
      },
    ],
  };

  it('résume la sélection et le total estimé', () => {
    const recap = buildRecap(base, ['Le solde est réglé au retrait ou à la livraison.']);
    expect(recap).toContain('Commande TR-000007 — Contactée');
    expect(recap).toContain('Date : samedi 24 octobre 2026');
    expect(recap).toContain('Livraison : Créteil');
    expect(recap).toContain('- 2 × Plateau découverte (Plateau de 20 pièces) : 80,00 €');
    expect(recap).toContain('- 1 × Layer cake (Bento) : 15,00 € — parfums : Vanille, Fraise');
    expect(recap).toContain('Total estimé : 82,00 €');
    expect(recap).not.toContain('Acompte');
  });

  it('indique l’acompte et le solde une fois le total convenu', () => {
    const recap = buildRecap(
      {
        ...base,
        status: 'deposit_received',
        agreedTotalCents: 9_000,
        depositCents: 2_000,
        depositReceivedAt: new Date(),
      },
      [],
    );
    expect(recap).toContain('Total : 90,00 €');
    expect(recap).toContain('Acompte : 20,00 € (reçu)');
    expect(recap).toContain('Solde au retrait ou à la livraison : 70,00 €');
  });
});
