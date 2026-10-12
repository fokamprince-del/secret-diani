import { createServer, type Server } from 'node:net';
import sharp from 'sharp';
import { ClamavClient } from './clamav.client';
import { detectFileType, unsupportedTypeMessage } from './file-signature';
import { processImage } from './image-pipeline';
import { toPublicImage } from './media.types';

function header(...parts: (string | number[])[]): Buffer {
  const bytes = Buffer.concat(
    parts.map((part) =>
      typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part),
    ),
  );
  return Buffer.concat([bytes, Buffer.alloc(32)]);
}

describe('detectFileType (octets magiques)', () => {
  it.each([
    ['JPEG', header([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    ['PNG', header([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    ['WebP', header('RIFF', [0, 0, 0, 0], 'WEBP'), 'image/webp'],
    ['AVIF', header([0, 0, 0, 0x1c], 'ftypavif'), 'image/avif'],
    ['PDF', header('%PDF-1.7'), 'application/pdf'],
  ])('reconnaît %s', (_label, buffer, mime) => {
    expect(detectFileType(buffer)?.mime).toBe(mime);
  });

  it.each([
    ['HTML déguisé en .jpg', header('<html><script>alert(1)</script>')],
    ['SVG (scripts possibles)', header('<svg xmlns="http://www.w3.org/2000/svg">')],
    ['exécutable', header('MZ', [0x90, 0])],
    ['ZIP / docx', header('PK', [3, 4])],
    ['vidéo MP4', header([0, 0, 0, 0x18], 'ftypmp42')],
    ['trop court', Buffer.from([0xff, 0xd8])],
  ])('refuse : %s', (_label, buffer) => {
    expect(detectFileType(buffer)).toBeNull();
  });

  it('message dédié pour les photos HEIC d’iPhone', () => {
    expect(unsupportedTypeMessage(header([0, 0, 0, 0x18], 'ftypheic'))).toMatch(/HEIC/);
    expect(unsupportedTypeMessage(header('GIF89a'))).toMatch(/JPEG, PNG, WebP, AVIF/);
  });
});

describe('processImage', () => {
  it('supprime les métadonnées EXIF (GPS…) et produit des variantes AVIF/WebP sans agrandir', async () => {
    const original = await sharp({
      create: { width: 1000, height: 500, channels: 3, background: '#DAB6AA' },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: 'Secret', Copyright: 'GPS 48.85,2.35' } })
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const result = await processImage(original);
    expect(result).toMatchObject({ width: 1000, height: 500 });
    expect(result.variants.map((v) => `${v.format}:${v.width}`).sort()).toEqual(
      [
        'avif:1000',
        'avif:320',
        'avif:640',
        'avif:960',
        'webp:1000',
        'webp:320',
        'webp:640',
        'webp:960',
      ].sort(),
    );
    for (const variant of result.variants) {
      const meta = await sharp(variant.buffer).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.format).toBe(variant.format === 'avif' ? 'heif' : 'webp');
    }
    expect(result.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(result.blurDataUrl.length).toBeLessThan(2000);
  });

  it('applique l’orientation EXIF avant de la supprimer', async () => {
    const portrait = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#fff' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await processImage(portrait);
    expect(result).toMatchObject({ width: 200, height: 400 });
  });

  it('refuse une « bombe de décompression »', async () => {
    const bomb = await sharp({
      create: { width: 10_000, height: 10_000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(2_000_000);
    await expect(processImage(bomb)).rejects.toThrow(/pixel/i);
  });

  it('refuse un fichier corrompu', async () => {
    await expect(processImage(Buffer.from([0xff, 0xd8, 0xff, 0, 1, 2, 3]))).rejects.toThrow();
  });
});

describe('ClamavClient (protocole clamd INSTREAM)', () => {
  let server: Server;
  let port: number;
  let received: Buffer;
  let reply = 'stream: OK\0';

  beforeAll(async () => {
    server = createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on('data', (data) => {
        chunks.push(data);
        const all = Buffer.concat(chunks);
        if (all.subarray(-4).equals(Buffer.alloc(4))) {
          received = all;
          socket.end(reply);
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('envoie le fichier par blocs préfixés de leur taille et conclut « sain »', async () => {
    reply = 'stream: OK\0';
    const verdict = await new ClamavClient('127.0.0.1', port).scan(Buffer.from('bonjour'));
    expect(verdict).toEqual({ clean: true });
    expect(received.subarray(0, 10).toString()).toBe('zINSTREAM\0');
    expect(received.readUInt32BE(10)).toBe(7);
    expect(received.subarray(14, 21).toString()).toBe('bonjour');
  });

  it('signale un fichier infecté', async () => {
    reply = 'stream: Eicar-Test-Signature FOUND\0';
    await expect(new ClamavClient('127.0.0.1', port).scan(Buffer.from('x'))).resolves.toEqual({
      clean: false,
      signature: 'Eicar-Test-Signature',
    });
  });

  it('échoue sur une réponse inattendue ou un démon injoignable', async () => {
    reply = 'INSTREAM size limit exceeded. ERROR\0';
    await expect(new ClamavClient('127.0.0.1', port).scan(Buffer.from('x'))).rejects.toThrow(
      /inattendue/,
    );
    await expect(new ClamavClient('127.0.0.1', 1).scan(Buffer.from('x'))).rejects.toThrow();
  });
});

describe('toPublicImage', () => {
  const media = {
    status: 'ready' as const,
    kind: 'image' as const,
    deletedAt: null,
    width: 1000,
    height: 500,
    blurDataUrl: 'data:image/webp;base64,AA',
    alt: 'Plateau découverte',
    variants: [
      { format: 'webp', width: 640, height: 320, key: 'k', url: 'https://cdn/640.webp', bytes: 1 },
      { format: 'webp', width: 320, height: 160, key: 'k', url: 'https://cdn/320.webp', bytes: 1 },
      { format: 'avif', width: 320, height: 160, key: 'k', url: 'https://cdn/320.avif', bytes: 1 },
    ],
  };

  it('trie les sources par largeur et choisit la plus grande WebP en repli', () => {
    expect(toPublicImage(media)).toEqual({
      alt: 'Plateau découverte',
      width: 1000,
      height: 500,
      blurDataUrl: 'data:image/webp;base64,AA',
      sources: {
        avif: [{ url: 'https://cdn/320.avif', width: 320 }],
        webp: [
          { url: 'https://cdn/320.webp', width: 320 },
          { url: 'https://cdn/640.webp', width: 640 },
        ],
      },
      url: 'https://cdn/640.webp',
    });
    expect(toPublicImage(media, '')?.alt).toBe('');
  });

  it('rien pour un média absent, non prêt ou supprimé', () => {
    expect(toPublicImage(null)).toBeNull();
    expect(toPublicImage({ ...media, status: 'processing' })).toBeNull();
    expect(toPublicImage({ ...media, deletedAt: new Date() })).toBeNull();
  });
});
