import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { toDecimalString } from '../../common/utils/money';
import { AppConfigService } from '../../config/app-config.service';
import { ContentCacheService } from '../../content/cache/content-cache.service';
import { notFound } from '../../content/common/content.helpers';
import { SiteInfoService } from '../../content/common/site-info.service';
import { PUBLIC_IMAGE_SELECT, type PublicImage, toPublicImage } from '../../media/media.types';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import {
  CONDITIONS,
  DEPOSIT_BELOW,
  DEPOSIT_FROM,
  DEPOSIT_THRESHOLD,
  MIN_NOTICE_DAYS,
  WHATSAPP_NUMBER,
} from '../catering.settings';
import { type DepositRule, depositSentence } from '../domain/deposit';
import { productMessage, whatsappUrl } from '../domain/whatsapp';
import type {
  CateringCatalogDto,
  CateringConditionsDto,
  CateringProductCardDto,
  CateringProductDetailDto,
  CompositionItemDto,
} from '../dto/catalog.dto';

/** Produit public : visible, non supprimé, dans une catégorie visible. */
export const PUBLIC_PRODUCT_WHERE = {
  deletedAt: null,
  visible: true,
  category: { visible: true },
} satisfies Prisma.CateringProductWhereInput;

const PRODUCT_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  composition: true,
  maxFlavours: true,
  seoTitle: true,
  seoDescription: true,
  updatedAt: true,
  category: { select: { slug: true, name: true, kind: true } },
  variants: {
    orderBy: { position: 'asc' },
    select: { id: true, label: true, priceCents: true, servingsMin: true, servingsMax: true },
  },
  flavours: {
    where: { flavour: { visible: true } },
    orderBy: { flavour: { position: 'asc' } },
    select: { flavour: { select: { id: true, slug: true, name: true } } },
  },
  images: {
    orderBy: { position: 'asc' },
    select: { alt: true, media: { select: PUBLIC_IMAGE_SELECT } },
  },
} satisfies Prisma.CateringProductSelect;

type ProductRow = Prisma.CateringProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

export function parseComposition(value: Prisma.JsonValue): CompositionItemDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const { label, quantity } = entry as Record<string, unknown>;
    if (typeof label !== 'string') return [];
    return [{ label, quantity: typeof quantity === 'number' ? quantity : null }];
  });
}

/**
 * Catalogue public du traiteur (plateaux, à la carte, layer cakes) et conditions de commande.
 * Une seule lecture alimente la page Traiteur ; mise en cache Redis, invalidée à chaque
 * modification de l'administration (étiquette « catering »).
 */
@Injectable()
export class CateringCatalogService {
  private readonly onlineOrdering: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
    private readonly settings: SettingsService,
    private readonly site: SiteInfoService,
    config: AppConfigService,
  ) {
    this.onlineOrdering = config.get('CATERING_ONLINE_ORDERING');
  }

  catalog(): Promise<CateringCatalogDto> {
    return this.cache.getOrSet('catering:catalog', async () => {
      const [categories, flavours, whatsapp, conditions] = await Promise.all([
        this.prisma.cateringCategory.findMany({
          where: { visible: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: {
            slug: true,
            name: true,
            description: true,
            kind: true,
            products: {
              where: { deletedAt: null, visible: true },
              orderBy: [{ position: 'asc' }, { name: 'asc' }],
              select: PRODUCT_SELECT,
            },
          },
        }),
        this.prisma.cateringFlavour.findMany({
          where: { visible: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        }),
        this.settings.get(WHATSAPP_NUMBER),
        this.conditions(),
      ]);
      return {
        categories: categories.map(({ products, ...category }) => ({
          ...category,
          // Une variante au moins est requise pour afficher un prix.
          products: products
            .filter((product) => product.variants.length > 0)
            .map((product) => this.toCard(product, whatsapp)),
        })),
        flavours,
        conditions,
      };
    });
  }

  async product(slug: string): Promise<CateringProductDetailDto> {
    return this.cache.getOrSet(`catering:product:${slug}`, async () => {
      const [product, whatsapp, info] = await Promise.all([
        this.prisma.cateringProduct.findFirst({
          where: { ...PUBLIC_PRODUCT_WHERE, slug, variants: { some: {} } },
          select: PRODUCT_SELECT,
        }),
        this.settings.get(WHATSAPP_NUMBER),
        this.site.get(),
      ]);
      if (!product) throw notFound('Produit introuvable.');
      const card = this.toCard(product, whatsapp);
      const canonicalUrl = this.site.url('/traiteur');
      return {
        ...card,
        category: product.category,
        seo: {
          title: product.seoTitle ?? `${product.name} · Traiteur`,
          description:
            product.seoDescription ??
            (product.description ?? `${product.name}, fait maison par ${info.authorName}.`).slice(
              0,
              160,
            ),
          canonicalUrl,
        },
        jsonLd: this.productJsonLd(card, info.name, canonicalUrl),
      };
    });
  }

  conditions(): Promise<CateringConditionsDto> {
    return this.cache.getOrSet('catering:conditions', async () => {
      const [thresholdCents, belowCents, fromCents, minNoticeDays, items, whatsapp] =
        await this.settings.getMany([
          DEPOSIT_THRESHOLD,
          DEPOSIT_BELOW,
          DEPOSIT_FROM,
          MIN_NOTICE_DAYS,
          CONDITIONS,
          WHATSAPP_NUMBER,
        ] as const);
      const deposit: DepositRule = { thresholdCents, belowCents, fromCents };
      return {
        items: [depositSentence(deposit), ...items],
        deposit,
        minNoticeDays,
        onlineOrdering: this.onlineOrdering,
        whatsappUrl: whatsappUrl(
          whatsapp,
          'Bonjour Diani, je souhaite des informations sur votre service traiteur.',
        ),
      };
    });
  }

  private toCard(product: ProductRow, whatsapp: string): CateringProductCardDto {
    const gallery = product.images
      .map((image) => toPublicImage(image.media, image.alt))
      .filter((image): image is PublicImage => image !== null);
    const prices = product.variants.map((variant) => variant.priceCents);
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      composition: parseComposition(product.composition),
      variants: product.variants,
      fromPriceCents: Math.min(...prices),
      maxFlavours: product.maxFlavours,
      flavours: product.maxFlavours > 0 ? product.flavours.map(({ flavour }) => flavour) : [],
      image: gallery[0] ?? null,
      gallery,
      whatsappUrl: whatsappUrl(whatsapp, productMessage(product.name)),
    };
  }

  private productJsonLd(
    card: CateringProductCardDto,
    brand: string,
    url: string,
  ): Record<string, unknown> {
    const prices = card.variants.map((variant) => variant.priceCents);
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: card.name,
      ...(card.description ? { description: card.description } : {}),
      ...(card.image ? { image: card.image.url } : {}),
      brand: { '@type': 'Brand', name: brand },
      url: `${url}#${card.slug}`,
      offers:
        card.variants.length === 1
          ? {
              '@type': 'Offer',
              price: toDecimalString(prices[0]!),
              priceCurrency: 'EUR',
              availability: 'https://schema.org/PreOrder',
            }
          : {
              '@type': 'AggregateOffer',
              lowPrice: toDecimalString(Math.min(...prices)),
              highPrice: toDecimalString(Math.max(...prices)),
              offerCount: card.variants.length,
              priceCurrency: 'EUR',
              availability: 'https://schema.org/PreOrder',
            },
    };
  }
}
