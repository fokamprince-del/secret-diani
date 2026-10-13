import type Stripe from 'stripe';
import { centsToDecimal, decimalToCents } from './domain/amounts';
import { captureEvidence } from './gateways/paypal.gateway';
import { paidSession, refundStatus } from './gateways/stripe.gateway';
import { buildAllowList } from './webhooks/webhook-ip.guard';

describe('montants', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [8_388, '83.88'],
    [100_000, '1000.00'],
  ])('%i centimes ↔ « %s »', (cents, decimal) => {
    expect(centsToDecimal(cents)).toBe(decimal);
    expect(decimalToCents(decimal)).toBe(cents);
  });

  it('accepte « 83.8 » et « 84 » sans flottant', () => {
    expect(decimalToCents('83.8')).toBe(8_380);
    expect(decimalToCents('84')).toBe(8_400);
  });

  it('refuse un montant mal formé ou négatif plutôt que de l’arrondir', () => {
    for (const value of ['83.888', '-1.00', '1e3', '12,50', '']) {
      expect(() => decimalToCents(value)).toThrow(RangeError);
    }
    expect(() => centsToDecimal(-1)).toThrow(RangeError);
    expect(() => centsToDecimal(1.5)).toThrow(RangeError);
  });
});

describe('liste d’adresses autorisées des webhooks', () => {
  const list = buildAllowList(['3.18.12.63', '54.187.174.0/24', '2600:1f14::/32']);

  it('accepte les adresses et plages déclarées', () => {
    expect(list.check('3.18.12.63', 'ipv4')).toBe(true);
    expect(list.check('54.187.174.169', 'ipv4')).toBe(true);
    expect(list.check('2600:1f14:abcd::1', 'ipv6')).toBe(true);
  });

  it('refuse les autres', () => {
    expect(list.check('3.18.12.64', 'ipv4')).toBe(false);
    expect(list.check('54.187.175.1', 'ipv4')).toBe(false);
  });

  it('refuse une configuration invalide au démarrage', () => {
    expect(() => buildAllowList(['pas-une-ip'])).toThrow(/WEBHOOK_ALLOWED_IPS/);
  });
});

describe('preuves de paiement', () => {
  it('session Stripe payée → identifiant, montant et devise', () => {
    const session = {
      id: 'cs_test_1',
      payment_intent: 'pi_1',
      amount_total: 8_388,
      currency: 'eur',
      metadata: { paymentId: 'pay-1' },
    } as unknown as Stripe.Checkout.Session;
    expect(paidSession(session)).toEqual({
      sessionId: 'cs_test_1',
      paymentId: 'pay-1',
      evidence: { providerPaymentId: 'pi_1', amountCents: 8_388, currency: 'EUR' },
    });
  });

  it('capture PayPal : seule une capture COMPLETED fait preuve', () => {
    expect(
      captureEvidence({
        id: 'CAP1',
        status: 'COMPLETED',
        amount: { value: '83.88', currency_code: 'EUR' },
      }),
    ).toEqual({ providerPaymentId: 'CAP1', amountCents: 8_388, currency: 'EUR' });
    expect(
      captureEvidence({
        id: 'CAP1',
        status: 'PENDING',
        amount: { value: '83.88', currency_code: 'EUR' },
      }),
    ).toBeNull();
    expect(captureEvidence(null)).toBeNull();
  });

  it('statuts de remboursement Stripe', () => {
    expect(refundStatus('succeeded')).toBe('succeeded');
    expect(refundStatus('pending')).toBe('pending');
    expect(refundStatus('requires_action')).toBe('pending');
    expect(refundStatus('canceled')).toBe('failed');
  });
});
