import { IdSigner } from './id-signer';

const ID = '01a13460-0000-7000-8000-00000000002a';
const KEY = Buffer.alloc(32, 7);

describe('IdSigner', () => {
  it('signe et relit un identifiant', () => {
    const signer = new IdSigner([KEY], 'test');
    expect(signer.verify(signer.sign(ID))).toBe(ID);
  });

  it('un jeton d’un autre usage ou falsifié est refusé', () => {
    const newsletter = new IdSigner([KEY], 'newsletter');
    const orders = new IdSigner([KEY], 'orders');
    expect(orders.verify(newsletter.sign(ID))).toBeNull();
    const token = newsletter.sign(ID);
    expect(newsletter.verify(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
    expect(newsletter.verify('court')).toBeNull();
  });

  it('accepte l’ancienne clé pendant une rotation', () => {
    const old = new IdSigner([Buffer.alloc(32, 1)], 'newsletter').sign(ID);
    expect(new IdSigner([KEY, Buffer.alloc(32, 1)], 'newsletter').verify(old)).toBe(ID);
    expect(new IdSigner([KEY], 'newsletter').verify(old)).toBeNull();
  });
});
