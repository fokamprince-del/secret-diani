import { resolveRequestId } from './request-id';
import { isUuid, uuidv7 } from './uuid';

describe('uuidv7', () => {
  it('produit un UUID v7 valide, ordonné dans le temps', () => {
    const first = uuidv7(1_700_000_000_000);
    const second = uuidv7(1_700_000_000_001);
    expect(isUuid(first)).toBe(true);
    expect(first[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(first[19]);
    expect(first < second).toBe(true);
    expect(first.startsWith('018bcfe5-6800')).toBe(true);
  });
});

describe('resolveRequestId', () => {
  it('réutilise un identifiant entrant valide', () => {
    const id = '01928f6e-7c1a-7b3e-9a6f-2f1c3d4e5f60';
    expect(resolveRequestId(id)).toBe(id);
  });

  it.each([undefined, '', 'injection\nlog', ['a', 'b'], 'x'.repeat(500)])(
    'génère un UUID v7 pour une valeur invalide (%p)',
    (incoming) => {
      const id = resolveRequestId(incoming);
      expect(isUuid(id)).toBe(true);
      expect(id[14]).toBe('7');
    },
  );
});
