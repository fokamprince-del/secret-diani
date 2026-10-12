import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Empreinte SHA-256 en hexadécimal (jetons opaques à forte entropie : pas besoin d'Argon2). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hmacSha256Hex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/** Jeton opaque aléatoire (256 bits par défaut), encodé en base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Comparaison en temps constant de deux chaînes. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
