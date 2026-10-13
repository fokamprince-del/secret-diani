import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export type BucketKind = 'private' | 'public';

/** Variantes publiques : contenu immuable (nom unique), mise en cache longue par le CDN. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Stockage objets compatible S3 (OVH Object Storage en production, MinIO en local).
 * Deux buckets : privé (originaux, documents — URL signées courtes uniquement) et
 * public (variantes d'images ré-encodées, servies par le CDN).
 * Les clés sont toujours générées par l'API (jamais dérivées d'un nom de fichier fourni).
 */
@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly buckets: Record<BucketKind, string>;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: AppConfigService) {
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT'),
      region: config.get('S3_REGION'),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY'),
      },
      // Sommes de contrôle seulement quand S3 les exige : sinon les SDK récents en ajoutent une,
      // calculée sur un corps vide, aux URL pré-signées, et les stockages compatibles (OVH,
      // SeaweedFS) refusent l'envoi (BadDigest).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: { requestTimeout: 30_000, connectionTimeout: 5_000 },
      maxAttempts: 3,
    });
    this.buckets = {
      private: config.get('S3_BUCKET_PRIVATE'),
      public: config.get('S3_BUCKET_PUBLIC'),
    };
    this.publicBaseUrl = config.get('MEDIA_PUBLIC_BASE_URL').replace(/\/$/, '');
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.get('S3_AUTO_CREATE_BUCKETS')) return;
    try {
      await this.ensureBuckets();
    } catch (error) {
      this.logger.warn(`Création des buckets impossible : ${(error as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  /** Développement et tests uniquement (interdit en production par la configuration). */
  async ensureBuckets(): Promise<void> {
    for (const kind of ['private', 'public'] as const) {
      const bucket = this.buckets[kind];
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    }
    // Lecture anonyme du bucket public seulement (équivalent local du CDN).
    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: this.buckets.public,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.buckets.public}/*`],
            },
          ],
        }),
      }),
    );
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async put(
    kind: BucketKind,
    key: string,
    body: Buffer,
    contentType: string,
    cacheControl?: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.buckets[kind],
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
        ...(cacheControl ? { CacheControl: cacheControl } : {}),
        // Jamais interprété comme une page par un navigateur.
        ContentDisposition: contentType.startsWith('image/') ? 'inline' : 'attachment',
      }),
    );
  }

  /** Taille d'un objet, ou null s'il n'existe pas. */
  async size(kind: BucketKind, key: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.buckets[kind], Key: key }),
      );
      return head.ContentLength ?? 0;
    } catch {
      return null;
    }
  }

  /** Lit un objet en mémoire, en refusant d'emblée ceux qui dépassent `maxBytes`. */
  async read(kind: BucketKind, key: string, maxBytes: number): Promise<Buffer> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.buckets[kind], Key: key }),
    );
    if ((object.ContentLength ?? 0) > maxBytes || !object.Body) {
      throw new Error('Objet trop volumineux ou vide');
    }
    const bytes = Buffer.from(await object.Body.transformToByteArray());
    if (bytes.length > maxBytes) throw new Error('Objet trop volumineux');
    return bytes;
  }

  async remove(kind: BucketKind, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.buckets[kind],
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  /**
   * URL d'envoi direct au stockage (PUT), valable 10 minutes. Le type et la taille sont signés :
   * le stockage refuse un autre fichier. Le worker revérifie tout de même le contenu réel.
   */
  presignUpload(key: string, contentType: string, size: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.buckets.private,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      }),
      { expiresIn: 600, signableHeaders: new Set(['content-type', 'content-length']) },
    );
  }

  /** URL de téléchargement signée et courte (documents privés), toujours en pièce jointe. */
  presignDownload(key: string, filename: string, expiresIn = 300): Promise<string> {
    const safeName = filename.replace(/[^\w.-]+/g, '_').slice(0, 100) || 'document';
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.buckets.private,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safeName}"`,
      }),
      { expiresIn },
    );
  }
}
