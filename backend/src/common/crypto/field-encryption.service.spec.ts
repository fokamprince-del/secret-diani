import type { AppConfigService } from '../../config/app-config.service';
import { FieldEncryptionService } from './field-encryption.service';

const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 2).toString('base64');

function service(current: string, previous?: string): FieldEncryptionService {
  const values: Record<string, string | undefined> = {
    FIELD_ENCRYPTION_KEY: current,
    FIELD_ENCRYPTION_KEY_PREVIOUS: previous,
  };
  return new FieldEncryptionService({ get: (key: string) => values[key] } as AppConfigService);
}

describe('FieldEncryptionService', () => {
  it('chiffre et déchiffre (AES-256-GCM), avec un IV différent à chaque fois', () => {
    const crypto = service(KEY_A);
    const first = crypto.encrypt('JBSWY3DPEHPK3PXP');
    const second = crypto.encrypt('JBSWY3DPEHPK3PXP');
    expect(first).not.toBe(second);
    expect(first).not.toContain('JBSWY3DPEHPK3PXP');
    expect(first.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(first)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('détecte toute altération (étiquette d’authentification)', () => {
    const crypto = service(KEY_A);
    const parts = crypto.encrypt('secret').split(':');
    const tampered = Buffer.from(parts[4]!, 'base64url');
    tampered[0] = tampered[0]! ^ 1;
    parts[4] = tampered.toString('base64url');
    expect(() => crypto.decrypt(parts.join(':'))).toThrow();
  });

  it('déchiffre avec l’ancienne clé pendant une rotation', () => {
    const encryptedWithA = service(KEY_A).encrypt('secret');
    const rotated = service(KEY_B, KEY_A);
    expect(rotated.decrypt(encryptedWithA)).toBe('secret');
    expect(rotated.needsReencryption(encryptedWithA)).toBe(true);
    expect(rotated.needsReencryption(rotated.encrypt('secret'))).toBe(false);
  });

  it('refuse une clé inconnue ou une valeur mal formée', () => {
    const encryptedWithA = service(KEY_A).encrypt('secret');
    expect(() => service(KEY_B).decrypt(encryptedWithA)).toThrow('Clé de chiffrement inconnue');
    expect(() => service(KEY_A).decrypt('n-importe-quoi')).toThrow('mal formée');
  });
});
