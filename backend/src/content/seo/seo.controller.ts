import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/decorators';
import { PublicContent } from '../common/content.helpers';
import { type SitemapEntry, SeoService } from './seo.service';

class SitemapEntryDto implements SitemapEntry {
  @ApiProperty()
  loc!: string;

  @ApiProperty({ nullable: true, type: String })
  lastModified!: string | null;

  @ApiProperty({ enum: ['daily', 'weekly', 'monthly', 'yearly'] })
  changeFrequency!: SitemapEntry['changeFrequency'];

  @ApiProperty()
  priority!: number;
}

@ApiTags('SEO')
@Controller('seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap')
  @PublicContent()
  @ApiOperation({ summary: 'Entrées du sitemap (JSON, pour `app/sitemap.ts` du frontend)' })
  @ApiOkResponse({ type: [SitemapEntryDto] })
  sitemap(): Promise<SitemapEntry[]> {
    return this.seo.sitemap();
  }

  @Get('sitemap.xml')
  @PublicContent()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiOperation({ summary: 'Sitemap du site au format XML' })
  @ApiOkResponse({ description: 'Document XML sitemaps.org' })
  sitemapXml(): Promise<string> {
    return this.seo.sitemapXml();
  }

  @Get('robots.txt')
  @PublicContent()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'robots.txt du site (espaces privés exclus de l’indexation)' })
  robots(): string {
    return this.seo.robotsTxt();
  }

  @Get('organization')
  @PublicContent()
  @ApiOperation({ summary: 'Données structurées schema.org de la marque (Organization)' })
  @ApiOkResponse({
    description: 'JSON-LD à insérer tel quel',
    schema: { type: 'object', additionalProperties: true },
  })
  organization(): Promise<Record<string, unknown>> {
    return this.seo.organizationJsonLd();
  }
}

/** robots.txt du domaine de l'API elle-même : rien à indexer. */
@ApiTags('SEO')
@Controller()
export class ApiRobotsController {
  @Get('robots.txt')
  @Public()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'robots.txt du domaine de l’API (hors préfixe)' })
  robots(): string {
    return 'User-agent: *\nDisallow: /\n';
  }
}
