import { describe, expect, it } from 'vitest';
import { formatDate, formatPrice, formatReadingTime, pluralize } from '@/lib/format';

// Intl insère des espaces insécables : on les normalise pour comparer.
const normalize = (value: string) => value.replace(/[  ]/g, ' ');

describe('formatPrice', () => {
  it('convertit des centimes en euros, à la française', () => {
    expect(normalize(formatPrice(2999))).toBe('29,99 €');
    expect(normalize(formatPrice(19999))).toBe('199,99 €');
    expect(normalize(formatPrice(0))).toBe('0,00 €');
  });
});

describe('formatDate', () => {
  it('écrit la date en toutes lettres', () => {
    expect(formatDate('2026-09-12')).toBe('12 septembre 2026');
  });

  it('renvoie une chaîne vide pour une date invalide', () => {
    expect(formatDate('pas une date')).toBe('');
  });
});

describe('formatReadingTime', () => {
  it('accorde et arrondit, avec un minimum d’une minute', () => {
    expect(formatReadingTime(0.2)).toBe('1 minute de lecture');
    expect(formatReadingTime(6.4)).toBe('6 minutes de lecture');
  });
});

describe('pluralize', () => {
  it('choisit la forme selon le nombre', () => {
    expect(pluralize(1, 'invité', 'invités')).toBe('1 invité');
    expect(pluralize(12, 'invité', 'invités')).toBe('12 invités');
  });
});
