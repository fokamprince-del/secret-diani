import type { MediaKind } from '@prisma/client';

export interface DetectedType {
  mime: string;
  kind: MediaKind;
}

/** Types acceptés (liste blanche). Le HEIC des iPhone n'est pas décodable : conversion demandée. */
export const ACCEPTED_TYPES: Record<string, DetectedType> = {
  'image/jpeg': { mime: 'image/jpeg', kind: 'image' },
  'image/png': { mime: 'image/png', kind: 'image' },
  'image/webp': { mime: 'image/webp', kind: 'image' },
  'image/avif': { mime: 'image/avif', kind: 'image' },
  'application/pdf': { mime: 'application/pdf', kind: 'document' },
};

export const MAX_BYTES: Record<MediaKind, number> = {
  image: 15 * 1024 * 1024,
  document: 30 * 1024 * 1024,
};

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function ascii(buffer: Buffer, start: number, end: number): string {
  return buffer.subarray(start, end).toString('latin1');
}

/**
 * Type réel d'un fichier d'après ses octets magiques — jamais d'après l'extension
 * ni le type déclaré par le navigateur. Retourne null pour tout type hors liste blanche.
 */
export function detectFileType(buffer: Buffer): DetectedType | null {
  if (buffer.length < 12) return null;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return ACCEPTED_TYPES['image/jpeg']!;
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return ACCEPTED_TYPES['image/png']!;
  }
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') {
    return ACCEPTED_TYPES['image/webp']!;
  }
  if (ascii(buffer, 4, 8) === 'ftyp') {
    const brand = ascii(buffer, 8, 12);
    if (brand === 'avif' || brand === 'avis') return ACCEPTED_TYPES['image/avif']!;
    return null; // HEIC/HEIF, MP4… : refusés.
  }
  if (ascii(buffer, 0, 5) === '%PDF-') return ACCEPTED_TYPES['application/pdf']!;
  return null;
}

/** Message de refus en français, orienté action. */
export function unsupportedTypeMessage(buffer: Buffer): string {
  if (ascii(buffer, 4, 8) === 'ftyp' && /^(heic|heix|mif1|hevc)/.test(ascii(buffer, 8, 12))) {
    return 'Les photos HEIC (iPhone) ne sont pas acceptées : exportez-les en JPEG puis réessayez.';
  }
  return 'Type de fichier non accepté. Formats possibles : JPEG, PNG, WebP, AVIF (images) ou PDF.';
}
