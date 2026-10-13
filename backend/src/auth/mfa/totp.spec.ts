import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totp,
  verifyTotp,
} from './totp';

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('HOTP (RFC 4226, annexe D)', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [3, '969429'],
    [4, '338314'],
    [5, '254676'],
    [6, '287922'],
    [7, '162583'],
    [8, '399871'],
    [9, '520489'],
  ])('compteur %i → %s', (counter, expected) => {
    expect(hotp(RFC_SECRET, counter)).toBe(expected);
  });
});

describe('TOTP (RFC 6238, annexe B, SHA-1)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('t = %i s → %s', (seconds, expected) => {
    expect(hotp(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
  });
});

describe('base32', () => {
  it('fait l’aller-retour (RFC 4648)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw6ytboi======').toString()).toBe('foobar');
  });

  it('refuse un caractère invalide', () => {
    expect(() => base32Decode('MZXW1')).toThrow();
  });
});

describe('verifyTotp', () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;

  it('génère un secret de 160 bits', () => {
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it('accepte le code courant et renvoie son pas', () => {
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(Math.floor(now / 30_000));
  });

  it('tolère un pas de dérive d’horloge, pas deux', () => {
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now + 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBeNull();
  });

  it('refuse un code mal formé', () => {
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });
});

describe('otpauthUri', () => {
  it('produit une URI lisible par les applications d’authentification', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'administration', 'Les Secrets de Diani');
    expect(uri).toMatch(/^otpauth:\/\/totp\/Les%20Secrets%20de%20Diani%3Aadministration\?/);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
