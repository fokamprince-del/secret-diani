import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

const MAC_BYTES = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Jeton signé portant un identifiant UUID : identifiant + HMAC-SHA256 tronqué à 128 bits, clé
 * dérivée (HKDF) des clés de chiffrement avec un libellé propre à l'usage (un jeton de
 * désinscription ne vaut pas lien de suivi de commande). Rien n'est stocké ; l'ancienne clé
 * reste acceptée pendant une rotation.
 */
export class IdSigner {
  private readonly keys: Buffer[];

  constructor(rawKeys: Buffer[], purpose: string) {
    this.keys = rawKeys.map((key) =>
      Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), purpose, 32)),
    );
  }

  sign(id: string): string {
    const bytes = Buffer.from(id.replace(/-/g, ''), 'hex');
    return Buffer.concat([bytes, this.mac(this.keys[0]!, bytes)]).toString('base64url');
  }

  /** Identifiant, ou null si le jeton est mal formé ou falsifié. */
  verify(token: string): string | null {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length !== 16 + MAC_BYTES || raw.toString('base64url') !== token) return null;
    const bytes = raw.subarray(0, 16);
    const mac = raw.subarray(16);
    if (!this.keys.some((key) => timingSafeEqual(this.mac(key, bytes), mac))) return null;
    const hex = bytes.toString('hex');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return UUID_PATTERN.test(uuid) ? uuid : null;
  }

  private mac(key: Buffer, bytes: Buffer): Buffer {
    return createHmac('sha256', key).update(bytes).digest().subarray(0, MAC_BYTES);
  }
}
