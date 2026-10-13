import type { FieldEncryptionService } from '../../common/crypto/field-encryption.service';
import { OrderLinkService } from './order-link.service';

const CURRENT = Buffer.alloc(32, 1);
const PREVIOUS = Buffer.alloc(32, 2);
const ORDER_ID = '01a13460-0000-7000-8000-00000000002a';

function signer(keys: Buffer[]): OrderLinkService {
  return new OrderLinkService({ rawKeys: keys } as unknown as FieldEncryptionService);
}

describe('OrderLinkService', () => {
  it('signe puis relit l’identifiant de la commande', () => {
    const links = signer([CURRENT]);
    const token = links.sign(ORDER_ID);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(links.verify(token)).toBe(ORDER_ID);
  });

  it('refuse un jeton falsifié, tronqué ou d’une autre commande', () => {
    const links = signer([CURRENT]);
    const token = links.sign(ORDER_ID);
    const tampered = `${token.slice(0, 10)}${token[10] === 'A' ? 'B' : 'A'}${token.slice(11)}`;
    expect(links.verify(tampered)).toBeNull();
    expect(links.verify(token.slice(0, -2))).toBeNull();
    expect(links.verify('pas-un-jeton')).toBeNull();
    // Identifiant changé sans connaître la clé : signature invalide.
    const otherId = Buffer.from(token, 'base64url');
    otherId[15] = (otherId[15]! + 1) % 256;
    expect(links.verify(otherId.toString('base64url'))).toBeNull();
  });

  it('refuse un jeton signé avec une autre clé, accepte l’ancienne clé pendant une rotation', () => {
    const before = signer([PREVIOUS]).sign(ORDER_ID);
    expect(signer([CURRENT]).verify(before)).toBeNull();
    expect(signer([CURRENT, PREVIOUS]).verify(before)).toBe(ORDER_ID);
  });
});
