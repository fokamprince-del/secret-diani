import { Injectable } from '@nestjs/common';
import type { Prisma, ShopProductKind } from '@prisma/client';
import { toDecimalString } from '../../common/utils/money';
import { ContentCacheService } from '../../content/cache/content-cache.service';
import { notFound } from '../../content/common/content.helpers';
import { SiteInfoService } from '../../content/common/site-info.service';
import { PUBLIC_IMAGE_SELECT, type PublicImage, toPublicImage } from '../../media/media.types';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import {
  type Availability,
  availability,
  availableQuantity,
  schemaAvailability,
} from '../domain/availability';
import { buildComparison } from '../domain/comparison';
import type {
  KitComparisonDto,
  ShopProductCardDto,
  ShopProductDetailDto,
} from '../dto/catalog.dto';
import { LOW_STOCK_DISPLAY } from '../shop.settings';

/** Produit vendable : visible et non supprimé, avec au moins une variante active. */
export const SELLABLE_PRODUCT = {
  deletedAt: null,
  visible: true,
} satisfies Prisma.ShopProductWhereInput;

const PRODUCT_SELECT = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  shortDescription: true,
  descriptionHtml: true,
  seoTitle: true,
  seoDescription: true,
  variants: {
    where: { active: true },
    orderBy: { position: 'asc' },
    select: { id: true, sku: true, label: true, priceCents: true },
  },
  kitItems: {
    orderBy: { position: 'asc' },
    select: { label: true, quantity: true, details: true },
  },
  images: {
    orderBy: { position: 'asc' },
    select: { alt: true, media: { select: PUBLIC_IMAGE_SELECT } },
  },
} satisfies Prisma.ShopProductSelect;

type ProductRow = Prisma.ShopProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

/** Partie stable d'un produit (mise en cache), sans la disponibilité. */
type CachedProduct = Omit<ShopProductDetailDto, 'availability' | 'variants' | 'jsonLd'> & {
  variants: Omit<ShopProductDetailDto['variants'][number], 'availability'>[];
};

/**
 * Catalogue public de la boutique. Textes, prix et images sont mis en cache (invalidés à chaque
 * modification) ; la **disponibilité** est lue en direct à chaque requête (« plus que 2 »),
 * pour ne jamais afficher un stock périmé pendant un pic de ventes.
 */
@Injectable()
export class ShopCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
    private readonly settings: SettingsService,
    private readonly site: SiteInfoService,
  ) {}

  async list(kind?: ShopProductKind): Promise<ShopProductCardDto[]> {
    const products = await this.cache.getOrSet(`shop:products:${kind ?? 'all'}`, async () => {
      const rows = await this.prisma.shopProduct.findMany({
        where: {
          ...SELLABLE_PRODUCT,
          ...(kind ? { kind } : {}),
          variants: { some: { active: true } },
        },
        orderBy: [{ kind: 'asc' }, { position: 'asc' }, { name: 'asc' }],
        take: 200,
        select: PRODUCT_SELECT,
      });
      return rows.map((row) => this.toCached(row));
    });
    const stock = await this.liveAvailability(products.flatMap((product) => product.variants));
    return products.map((product) => {
      const {
        descriptionHtml: _html,
        composition: _items,
        gallery: _gallery,
        seo: _seo,
        variants,
        ...card
      } = product;
      return {
        ...card,
        availability: this.best(variants.map((variant) => stock.get(variant.id)!)),
      };
    });
  }

  async detail(slug: string): Promise<ShopProductDetailDto> {
    const product = await this.cache.getOrSet(`shop:product:${slug}`, async () => {
      const row = await this.prisma.shopProduct.findFirst({
        where: { ...SELLABLE_PRODUCT, slug, variants: { some: { active: true } } },
        select: PRODUCT_SELECT,
      });
      if (!row) throw notFound('Produit introuvable.');
      return this.toCached(row);
    });
    const stock = await this.liveAvailability(product.variants);
    const variants = product.variants.map((variant) => ({
      ...variant,
      availability: stock.get(variant.id)!,
    }));
    const info = await this.site.get();
    const best = this.best(variants.map((variant) => variant.availability));
    return {
      ...product,
      variants,
      availability: best,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        ...(product.shortDescription ? { description: product.shortDescription } : {}),
        ...(product.image ? { image: product.gallery.map((image) => image.url) } : {}),
        sku: variants[0]?.sku,
        brand: { '@type': 'Brand', name: info.name },
        url: product.seo.canonicalUrl,
        offers: variants.map((variant) => ({
          '@type': 'Offer',
          sku: variant.sku,
          name: variant.label,
          price: toDecimalString(variant.priceCents),
          priceCurrency: 'EUR',
          availability: schemaAvailability(variant.availability.status),
          url: product.seo.canonicalUrl,
        })),
      },
    };
  }

  /** Tableau comparatif des kits, déduit de leur composition. */
  comparison(): Promise<KitComparisonDto> {
    return this.cache.getOrSet('shop:comparison', async () => {
      const kits = await this.prisma.shopProduct.findMany({
        where: { ...SELLABLE_PRODUCT, kind: 'kit', variants: { some: { active: true } } },
        orderBy: { position: 'asc' },
        select: {
          slug: true,
          name: true,
          variants: { where: { active: true }, select: { priceCents: true } },
          kitItems: { orderBy: { position: 'asc' }, select: { label: true, quantity: true } },
        },
      });
      return buildComparison(
        kits.map((kit) => ({
          slug: kit.slug,
          name: kit.name,
          fromPriceCents: Math.min(...kit.variants.map((variant) => variant.priceCents)),
          items: kit.kitItems,
        })),
      );
    });
  }

  /** Disponibilité en direct d'une liste de variantes (une requête). */
  async liveAvailability(variants: { id: string }[]): Promise<Map<string, Availability>> {
    const [stocks, threshold] = await Promise.all([
      this.prisma.shopStock.findMany({
        where: { variantId: { in: variants.map((variant) => variant.id) } },
        select: { variantId: true, onHand: true, reserved: true },
      }),
      this.settings.get(LOW_STOCK_DISPLAY),
    ]);
    return new Map(
      variants.map((variant) => [
        variant.id,
        availability(
          availableQuantity(stocks.find((stock) => stock.variantId === variant.id) ?? null),
          threshold,
        ),
      ]),
    );
  }

  private best(list: Availability[]): Availability {
    const rank = { in_stock: 2, low_stock: 1, out_of_stock: 0 } as const;
    return list.reduce<Availability>(
      (best, current) => (rank[current.status] > rank[best.status] ? current : best),
      { status: 'out_of_stock', remaining: 0 },
    );
  }

  private toCached(row: ProductRow): CachedProduct {
    const gallery = row.images
      .map((image) => toPublicImage(image.media, image.alt))
      .filter((image): image is PublicImage => image !== null);
    const canonicalUrl = this.site.url(`/boutique/${row.slug}`);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      shortDescription: row.shortDescription,
      fromPriceCents: Math.min(...row.variants.map((variant) => variant.priceCents)),
      image: gallery[0] ?? null,
      gallery,
      descriptionHtml: row.descriptionHtml,
      composition: row.kitItems,
      variants: row.variants,
      seo: {
        title: row.seoTitle ?? `${row.name} · Boutique`,
        description: row.seoDescription ?? (row.shortDescription ?? row.name).slice(0, 160),
        canonicalUrl,
      },
    };
  }
}
