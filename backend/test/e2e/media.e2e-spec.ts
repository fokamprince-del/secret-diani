import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import type { App } from 'supertest/types';
import { AppConfigService } from '../../src/config/app-config.service';
import { MediaProcessingService } from '../../src/media/media-processing.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { type AdminSession, createAdminSession } from './utils/admin-helpers';
import { client, MailInbox, registerVerifiedUser } from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

async function photoWithGps(width = 1200, height = 800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#E9CDB8' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'Diani', Copyright: 'Position GPS 48.8566,2.3522' } })
    .toBuffer();
}

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

describe('Médias : envoi sécurisé et variantes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: StorageService;
  let processing: MediaProcessingService;
  let admin: AdminSession;
  const inbox = new MailInbox();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    await storage.ensureBuckets();
    // Service du worker, exécuté ici directement (le worker ne tourne pas pendant les e2e).
    processing = new MediaProcessingService(prisma, storage, app.get(AppConfigService));
    admin = await createAdminSession(app);
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  const upload = (buffer: Buffer, filename: string, contentType: string) =>
    admin.http
      .post('/admin/media', admin.accessToken)
      .attach('file', buffer, { filename, contentType });

  it('image : renommée, ré-encodée en AVIF/WebP sans EXIF, original supprimé', async () => {
    const res = await upload(await photoWithGps(), '../../etc/passwd photo.jpg', 'image/jpeg')
      .field('alt', 'Plateau découverte')
      .expect(201);
    expect(res.body).toMatchObject({
      kind: 'image',
      status: 'processing',
      alt: 'Plateau découverte',
    });
    // Le chemin fourni par le navigateur est ignoré : seul le nom de base est conservé, pour l'affichage.
    expect(res.body.originalName).toBe('passwd photo.jpg');

    const media = await prisma.media.findUniqueOrThrow({ where: { id: res.body.id as string } });
    expect(media.storageKey).toBe(`originals/${media.id}`);
    expect(await storage.size('private', media.storageKey)).toBeGreaterThan(0);

    await expect(processing.process(media.id)).resolves.toBe('ready');
    const ready = await admin.http.get(`/admin/media/${media.id}`, admin.accessToken).expect(200);
    expect(ready.body).toMatchObject({
      status: 'ready',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 800,
      scanResult: 'skipped',
    });
    expect(
      (ready.body.variants as { width: number }[]).map((v) => v.width).sort((a, b) => a - b),
    ).toEqual([320, 320, 640, 640, 960, 960, 1200, 1200]);
    expect(ready.body.blurDataUrl).toMatch(/^data:image\/webp;base64,/);

    // Variante publique servie par le stockage : WebP, sans métadonnées, cache long.
    const webp = (ready.body.variants as { format: string; width: number; url: string }[]).find(
      (v) => v.format === 'webp' && v.width === 640,
    )!;
    expect(webp.url).toBe(`http://127.0.0.1:58333/diani-test-public/media/${media.id}/640.webp`);
    const served = await fetch(webp.url);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/webp');
    const metadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect(metadata.exif).toBeUndefined();

    // L'original (avec sa position GPS) n'est pas conservé.
    expect(await storage.size('private', media.storageKey)).toBeNull();
  });

  it('refuse un fichier déguisé (HTML nommé .jpg) avant tout stockage', async () => {
    const before = await prisma.media.count();
    const res = await upload(
      Buffer.from('<html><script>document.cookie</script></html>'.padEnd(64, ' ')),
      'photo.jpg',
      'image/jpeg',
    ).expect(415);
    expect(res.body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    expect(res.body.message).toMatch(/JPEG, PNG, WebP, AVIF/);
    expect(await prisma.media.count()).toBe(before);
  });

  it('refuse un SVG (scripts possibles) et indique quoi faire d’une photo HEIC', async () => {
    await upload(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"></svg>'),
      'a.svg',
      'image/svg+xml',
    ).expect(415);
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic'),
      Buffer.alloc(32),
    ]);
    const res = await upload(heic, 'IMG_0001.HEIC', 'image/heic').expect(415);
    expect(res.body.message).toMatch(/HEIC/);
  });

  it('refuse une image de plus de 15 Mo et un fichier de plus de 30 Mo', async () => {
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(16 * 1024 * 1024),
    ]);
    const res = await upload(big, 'enorme.jpg', 'image/jpeg').expect(413);
    expect(res.body.message).toBe('Fichier trop volumineux (maximum 15 Mo).');
    await upload(Buffer.alloc(31 * 1024 * 1024), 'trop.pdf', 'application/pdf').expect(413);
  });

  it('PDF : conservé en privé, téléchargeable par URL signée en pièce jointe', async () => {
    const res = await upload(PDF, 'fiche-genoise.pdf', 'application/pdf').expect(201);
    await processing.process(res.body.id as string);
    const link = await admin.http
      .get(`/admin/media/${res.body.id as string}/download`, admin.accessToken)
      .expect(200);
    expect(link.body.url).toContain('X-Amz-Signature=');
    expect(link.body.url).toContain('X-Amz-Expires=300');
    const file = await fetch(link.body.url as string);
    expect(file.status).toBe(200);
    expect(
      Buffer.from(await file.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
  });

  it('envoi direct par URL pré-signée, contenu réel revérifié par le worker', async () => {
    const png = await sharp({
      create: { width: 300, height: 300, channels: 4, background: '#9B6155' },
    })
      .png()
      .toBuffer();
    const prepared = await admin.http
      .post('/admin/media/uploads', admin.accessToken)
      .send({ filename: 'logo.png', contentType: 'image/png', size: png.length })
      .expect(201);
    expect(prepared.body.media.status).toBe('pending');
    const put = await fetch(prepared.body.uploadUrl as string, {
      method: 'PUT',
      headers: prepared.body.headers as Record<string, string>,
      body: png,
    });
    expect(put.status).toBe(200);
    const id = prepared.body.media.id as string;
    await admin.http.post(`/admin/media/${id}/complete`, admin.accessToken).expect(200);
    await admin.http.post(`/admin/media/${id}/complete`, admin.accessToken).expect(409);
    await expect(processing.process(id)).resolves.toBe('ready');

    // Un PDF envoyé à la place de l'image annoncée est refusé et effacé.
    const trap = await admin.http
      .post('/admin/media/uploads', admin.accessToken)
      .send({ filename: 'photo.png', contentType: 'image/png', size: PDF.length })
      .expect(201);
    await fetch(trap.body.uploadUrl as string, {
      method: 'PUT',
      headers: trap.body.headers as Record<string, string>,
      body: PDF,
    });
    await admin.http.post(
      `/admin/media/${trap.body.media.id as string}/complete`,
      admin.accessToken,
    );
    await expect(processing.process(trap.body.media.id as string)).resolves.toBe('rejected');
    const rejected = await admin.http
      .get(`/admin/media/${trap.body.media.id as string}`, admin.accessToken)
      .expect(200);
    expect(rejected.body.rejectionReason).toBe(
      'Le contenu du fichier ne correspond pas au type annoncé.',
    );
  });

  it('refuse de préparer un envoi d’un type non accepté ou trop gros', async () => {
    await admin.http
      .post('/admin/media/uploads', admin.accessToken)
      .send({ filename: 'x.exe', contentType: 'application/x-msdownload', size: 10 })
      .expect(400);
    await admin.http
      .post('/admin/media/uploads', admin.accessToken)
      .send({ filename: 'x.jpg', contentType: 'image/jpeg', size: 20 * 1024 * 1024 })
      .expect(413);
  });

  it('modifie le texte alternatif, liste, puis supprime (fichiers purgés)', async () => {
    const res = await upload(await photoWithGps(400, 300), 'a.jpg', 'image/jpeg').expect(201);
    const id = res.body.id as string;
    await processing.process(id);
    await admin.http
      .patch(`/admin/media/${id}`, admin.accessToken)
      .send({ alt: 'Layer cake fraise' })
      .expect(200);
    const list = await admin.http
      .get('/admin/media?kind=image&status=ready', admin.accessToken)
      .expect(200);
    expect((list.body.items as { id: string }[]).map((m) => m.id)).toContain(id);

    await admin.http.delete(`/admin/media/${id}`, admin.accessToken).expect(204);
    await admin.http.get(`/admin/media/${id}`, admin.accessToken).expect(404);
    await processing.purgeFiles(id);
    const variant = await fetch(`http://127.0.0.1:58333/diani-test-public/media/${id}/400.webp`);
    expect(variant.status).toBe(404);
  });

  it('réservé aux administrateurs', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    await client(app)
      .post('/admin/media')
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(401);
    const cliente = await registerVerifiedUser(app, inbox);
    await cliente.http
      .post('/admin/media', cliente.accessToken)
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(403);
  });
});
