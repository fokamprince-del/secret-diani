import { Injectable } from '@nestjs/common';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { FieldEncryptionService } from '../../common/crypto/field-encryption.service';

const MAC_BYTES = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Lien de suivi d'une commande (achat sans compte) : jeton **signé** = identifiant de commande
 * + HMAC-SHA256 tronqué à 128 bits, avec une clé dérivée (HKDF) de la clé de chiffrement.
 * Rien n'est stocké : le lien peut être renvoyé dans chaque e-mail. Il ne donne qu'un accès en
 * lecture à une commande. L'ancienne clé reste acceptée pendant une rotation.
 */
@Injectable()
export class OrderLinkService {
  private readonly keys: Buffer[];

  constructor(encryption: FieldEncryptionService) {
    this.keys = encryption.rawKeys.map((key) =>
      Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'diani-order-tracking-link', 32)),
    );
  }

  sign(orderId: string): string {
    const id = uuidToBytes(orderId);
    return Buffer.concat([id, this.mac(this.keys[0]!, id)]).toString('base64url');
  }

  /** Identifiant de la commande, ou null si le jeton est mal formé ou falsifié. */
  verify(token: string): string | null {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length !== 16 + MAC_BYTES || raw.toString('base64url') !== token) return null;
    const id = raw.subarray(0, 16);
    const mac = raw.subarray(16);
    const valid = this.keys.some((key) => timingSafeEqual(this.mac(key, id), mac));
    const uuid = bytesToUuid(id);
    return valid && UUID_PATTERN.test(uuid) ? uuid : null;
  }

  private mac(key: Buffer, id: Buffer): Buffer {
    return createHmac('sha256', key).update(id).digest().subarray(0, MAC_BYTES);
  }
}
