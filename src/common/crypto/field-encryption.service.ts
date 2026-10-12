import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';

interface EncryptionKey {
  id: string;
  key: Buffer;
}

const ALGORITHM = 'aes-256-gcm';
const FORMAT_VERSION = 'v1';

/** Identifiant court et non secret d'une clé, inscrit dans chaque valeur chiffrée. */
function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

/**
 * Chiffrement des champs sensibles au repos (secrets 2FA…) : AES-256-GCM, IV aléatoire,
 * clé hors base (FIELD_ENCRYPTION_KEY). Format : `v1:<idClé>:<iv>:<tag>:<chiffré>` (base64url).
 * Rotation : l'ancienne clé (FIELD_ENCRYPTION_KEY_PREVIOUS) reste utilisable en déchiffrement.
 */
@Injectable()
export class FieldEncryptionService {
  private readonly current: EncryptionKey;
  private readonly keys: EncryptionKey[];

  constructor(config: AppConfigService) {
    this.current = FieldEncryptionService.toKey(config.get('FIELD_ENCRYPTION_KEY'));
    const previous = config.get('FIELD_ENCRYPTION_KEY_PREVIOUS');
    this.keys = previous ? [this.current, FieldEncryptionService.toKey(previous)] : [this.current];
  }

  private static toKey(base64: string): EncryptionKey {
    const key = Buffer.from(base64, 'base64');
    return { id: keyId(key), key };
  }

  /** Clés brutes (courante en premier), pour dériver des empreintes HMAC. */
  get rawKeys(): Buffer[] {
    return this.keys.map((entry) => entry.key);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.current.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [FORMAT_VERSION, this.current.id, iv, tag, encrypted]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join(':');
  }

  decrypt(payload: string): string {
    const [version, id, iv, tag, encrypted] = payload.split(':');
    if (version !== FORMAT_VERSION || !id || !iv || !tag || encrypted === undefined) {
      throw new Error('Valeur chiffrée mal formée');
    }
    const entry = this.keys.find((candidate) => candidate.id === id);
    if (!entry) throw new Error('Clé de chiffrement inconnue');
    const decipher = createDecipheriv(ALGORITHM, entry.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Vrai si la valeur a été chiffrée avec une ancienne clé (à rechiffrer). */
  needsReencryption(payload: string): boolean {
    return payload.split(':')[1] !== this.current.id;
  }
}
