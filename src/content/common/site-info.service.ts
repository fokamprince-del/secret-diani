import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface SiteInfo {
  name: string;
  url: string;
  authorName: string;
  instagramUrl: string | null;
  logoUrl: string | null;
}

/**
 * Informations de la marque utilisées par le SEO (JSON-LD, sitemap). Modifiables sans
 * déploiement via les paramètres du site (`app_settings`), avec des valeurs par défaut sûres.
 */
@Injectable()
export class SiteInfoService {
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL').replace(/\/$/, '');
  }

  url(path = ''): string {
    return `${this.siteUrl}${path}`;
  }

  async get(): Promise<SiteInfo> {
    const settings = await this.prisma.appSetting.findMany({
      where: {
        key: { in: ['site.name', 'site.author_name', 'site.instagram_url', 'site.logo_url'] },
      },
      select: { key: true, value: true },
    });
    const value = (key: string): string | null => {
      const found = settings.find((setting) => setting.key === key)?.value;
      return typeof found === 'string' && found.trim() ? found.trim() : null;
    };
    return {
      name: value('site.name') ?? 'Les Secrets de Diani',
      url: this.siteUrl,
      authorName: value('site.author_name') ?? 'Diani',
      instagramUrl: value('site.instagram_url'),
      logoUrl: value('site.logo_url'),
    };
  }
}
