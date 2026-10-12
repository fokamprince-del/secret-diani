import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) sur HOTP (RFC 4226) : HMAC-SHA1, 6 chiffres, pas de 30 s — paramètres
 * compris par toutes les applications d'authentification. Validé par les vecteurs de test
 * de la RFC (voir totp.spec.ts).
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Tolérance de dérive d'horloge : un pas avant et un pas après. */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Caractère base32 invalide');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secret de 160 bits (taille recommandée par la RFC 4226), encodé en base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function totp(secretBase32: string, nowMs: number = Date.now()): string {
  return hotp(base32Decode(secretBase32), totpStep(nowMs));
}

/**
 * Vérifie un code dans la fenêtre de tolérance. Retourne le pas correspondant (à mémoriser
 * pour refuser tout rejeu du même code), ou null. Comparaison en temps constant.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  nowMs: number = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(nowMs);
  const expected = Buffer.from(code);
  let matched: number | null = null;
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const candidate = Buffer.from(hotp(secret, current + offset));
    if (timingSafeEqual(candidate, expected)) matched = current + offset;
  }
  return matched;
}

export function otpauthUri(secretBase32: string, accountLabel: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
