import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { SettingsService } from '../../settings/settings.service';
import { AUTHOR_NAME, LOGO_URL, SITE_NAME, SOCIAL_LINKS } from '../../settings/site.settings';

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
    private readonly settings: SettingsService,
    config: AppConfigService,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL').replace(/\/$/, '');
  }

  url(path = ''): string {
    return `${this.siteUrl}${path}`;
  }

  async get(): Promise<SiteInfo> {
    const [name, authorName, social, logoUrl] = await this.settings.getMany([
      SITE_NAME,
      AUTHOR_NAME,
      SOCIAL_LINKS,
      LOGO_URL,
    ]);
    return {
      name,
      url: this.siteUrl,
      authorName,
      instagramUrl: social.instagram || null,
      logoUrl: logoUrl || null,
    };
  }
}
