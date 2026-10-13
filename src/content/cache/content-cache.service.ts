import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { REVALIDATE_QUEUE, type RevalidateJobData } from './revalidate.constants';

const VERSION_KEY = 'cache:content:version';

/** Étiquettes de revalidation transmises au frontend (Next.js `revalidateTag`). */
export type ContentTag =
  | 'articles'
  | `article:${string}`
  | 'article-categories'
  | 'pages'
  | `page:${string}`
  | 'faq'
  | 'reviews'
  | 'media'
  | 'catering'
  | 'sitemap';

/**
 * Cache Redis des contenus publics (catalogues lus par des milliers de visiteurs).
 * Invalidation globale par numéro de version : toute modification admin incrémente la version,
 * les anciennes entrées deviennent inaccessibles puis expirent seules (aucun SCAN).
 * La modification déclenche aussi la revalidation des pages du frontend.
 */
@Injectable()
export class ContentCacheService {
  private readonly logger = new Logger(ContentCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(REVALIDATE_QUEUE) private readonly revalidateQueue: Queue<RevalidateJobData>,
    config: AppConfigService,
  ) {
    this.ttlSeconds = config.get('CONTENT_CACHE_TTL_SECONDS');
  }

  async getOrSet<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (this.ttlSeconds === 0) return loader();
    let cacheKey: string | null = null;
    try {
      const version = (await this.redis.get(VERSION_KEY)) ?? '0';
      cacheKey = `cache:content:v${version}:${key}`;
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch (error) {
      // Redis indisponible : la base répond directement (dégradation sans erreur visible).
      this.logger.warn(`Cache indisponible : ${(error as Error).message}`);
    }
    const value = await loader();
    if (cacheKey) {
      await this.redis
        .set(cacheKey, JSON.stringify(value), 'EX', this.ttlSeconds)
        .catch(() => undefined);
    }
    return value;
  }

  /** À appeler après toute modification de contenu publié. */
  async changed(tags: ContentTag[]): Promise<void> {
    await this.redis.incr(VERSION_KEY);
    const allTags = [...new Set<ContentTag>([...tags, 'sitemap'])];
    // Regroupement : plusieurs modifications rapprochées → une seule revalidation (2 s).
    await this.revalidateQueue.add(
      'revalidate',
      { tags: allTags },
      { delay: 2_000, removeOnComplete: true },
    );
  }
}
