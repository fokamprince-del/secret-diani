import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ContentCacheService } from '../../content/cache/content-cache.service';
import { fieldError, notFound } from '../../content/common/content.helpers';
import { MarkdownService } from '../../content/markdown/markdown.service';
import { slugify } from '../../content/markdown/slug';
import { storedVariants } from '../../media/media.types';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdminShopProductDto,
  CreateShopProductDto,
  ShopVariantInputDto,
  UpdateShopProductDto,
} from '../dto/admin.dto';

const PRODUCT_SELECT = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  shortDescription: true,
  descriptionMarkdown: true,
  position: true,
  visible: true,
  seoTitle: true,
  seoDescription: true,
  updatedAt: true,
  variants: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      sku: true,
      label: true,
      priceCents: true,
      weightGrams: true,
      active: true,
      stock: { select: { onHand: true, reserved: true } },
    },
  },
  kitItems: {
    orderBy: { position: 'asc' },
    select: { label: true, quantity: true, details: true },
  },
  images: {
    orderBy: { position: 'asc' },
    select: { mediaId: true, alt: true, media: { select: { variants: true } } },
  },
} satisfies Prisma.ShopProductSelect;

type ProductRow = Prisma.ShopProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** Slug ou référence (SKU) déjà utilisés : le champ en cause est précisé. */
function uniqueConflict(error: Prisma.PrismaClientKnownRequestError): AppException {
  const target = JSON.stringify(error.meta?.target ?? '');
  const field = target.includes('sku') ? 'variants.sku' : 'slug';
  return new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.CONFLICT,
    field === 'slug'
      ? 'Cette adresse (slug) est déjà utilisée.'
      : 'Cette référence (SKU) est déjà utilisée.',
    [{ field, messages: ['déjà utilisée'] }],
  );
}

function assertUniqueSkus(variants: ShopVariantInputDto[]): void {
  const skus = variants.map((variant) => variant.sku);
  if (new Set(skus).size !== skus.length)
    throw fieldError('variants', 'deux variantes ont la même référence');
}

/**
 * Administration des produits et kits : variantes (référence, prix, poids), composition,
 * photos, description Markdown. Chaque variante a son stock (créé à zéro, réassort par
 * l'écran Stock). Une variante qui a déjà été vendue ou mise en panier n'est jamais effacée :
 * elle est désactivée, pour garder l'historique.
 */
@Injectable()
export class AdminShopProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markdown: MarkdownService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
  ) {}

  async list(kind?: 'kit' | 'accessory'): Promise<AdminShopProductDto[]> {
    const rows = await this.prisma.shopProduct.findMany({
      where: { deletedAt: null, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      take: 500,
      select: PRODUCT_SELECT,
    });
    return rows.map((row) => this.toAdmin(row));
  }

  async get(id: string): Promise<AdminShopProductDto> {
    const row = await this.prisma.shopProduct.findFirst({
      where: { id, deletedAt: null },
      select: PRODUCT_SELECT,
    });
    if (!row) throw notFound('Produit introuvable.');
    return this.toAdmin(row);
  }

  async create(dto: CreateShopProductDto, actorId: string): Promise<AdminShopProductDto> {
    assertUniqueSkus(dto.variants);
    if (dto.variants.some((variant) => variant.id)) {
      throw fieldError(
        'variants',
        'un nouveau produit ne peut pas reprendre une variante existante',
      );
    }
    await this.assertImages(dto.images);
    const position = await this.prisma.shopProduct.count({
      where: { kind: dto.kind, deletedAt: null },
    });
    const description = dto.descriptionMarkdown ?? '';
    let id: string;
    try {
      ({ id } = await this.prisma.shopProduct.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? (slugify(dto.name, 160) || 'produit'),
          kind: dto.kind,
          shortDescription: dto.shortDescription ?? null,
          descriptionMarkdown: description,
          descriptionHtml: this.markdown.render(description).html,
          visible: dto.visible ?? true,
          seoTitle: dto.seoTitle ?? null,
          seoDescription: dto.seoDescription ?? null,
          position,
          variants: {
            create: dto.variants.map((variant, index) => ({
              sku: variant.sku,
              label: variant.label,
              priceCents: variant.priceCents,
              weightGrams: variant.weightGrams,
              active: variant.active ?? true,
              position: index,
              stock: { create: {} },
            })),
          },
          kitItems: {
            create: (dto.composition ?? []).map((item, index) => ({
              label: item.label,
              quantity: item.quantity,
              details: item.details ?? null,
              position: index,
            })),
          },
          images: {
            create: (dto.images ?? []).map((image, index) => ({
              mediaId: image.mediaId,
              alt: image.alt ?? '',
              position: index,
            })),
          },
        },
        select: { id: true },
      }));
    } catch (error) {
      if (isPrismaError(error, 'P2002'))
        throw uniqueConflict(error as Prisma.PrismaClientKnownRequestError);
      throw error;
    }
    await this.changed(actorId, id);
    return this.get(id);
  }

  /** Les tableaux fournis (variantes, composition, images) remplacent l'existant. */
  async update(
    id: string,
    dto: UpdateShopProductDto,
    actorId: string,
  ): Promise<AdminShopProductDto> {
    await this.get(id);
    await this.assertImages(dto.images);
    const variants = dto.variants;
    if (variants) {
      assertUniqueSkus(variants);
      const keptIds = variants.flatMap((variant) => (variant.id ? [variant.id] : []));
      const owned = await this.prisma.shopVariant.count({
        where: { id: { in: keptIds }, productId: id },
      });
      if (owned !== keptIds.length || new Set(keptIds).size !== keptIds.length) {
        throw fieldError('variants', 'contient une variante inconnue ou en double');
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.shopProduct.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
            ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
            ...(dto.shortDescription !== undefined
              ? { shortDescription: dto.shortDescription }
              : {}),
            ...(dto.descriptionMarkdown !== undefined
              ? {
                  descriptionMarkdown: dto.descriptionMarkdown,
                  descriptionHtml: this.markdown.render(dto.descriptionMarkdown).html,
                }
              : {}),
            ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
            ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
            ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription } : {}),
          },
        });

        if (variants) {
          const keptIds = variants.flatMap((variant) => (variant.id ? [variant.id] : []));
          const removed = await tx.shopVariant.findMany({
            where: { productId: id, id: { notIn: keptIds } },
            select: {
              id: true,
              _count: { select: { movements: true, cartItems: true, reservations: true } },
            },
          });
          for (const variant of removed) {
            const hasHistory =
              variant._count.movements + variant._count.cartItems + variant._count.reservations > 0;
            const sold = await tx.orderItem.count({ where: { variantId: variant.id } });
            if (hasHistory || sold > 0) {
              await tx.shopVariant.update({ where: { id: variant.id }, data: { active: false } });
            } else {
              await tx.shopVariant.delete({ where: { id: variant.id } });
            }
          }
          for (const [position, variant] of variants.entries()) {
            const data = {
              sku: variant.sku,
              label: variant.label,
              priceCents: variant.priceCents,
              weightGrams: variant.weightGrams,
              active: variant.active ?? true,
              position,
            };
            if (variant.id) {
              await tx.shopVariant.update({ where: { id: variant.id }, data });
            } else {
              await tx.shopVariant.create({
                data: { ...data, productId: id, stock: { create: {} } },
              });
            }
          }
        }

        if (dto.composition) {
          await tx.shopKitItem.deleteMany({ where: { productId: id } });
          await tx.shopKitItem.createMany({
            data: dto.composition.map((item, position) => ({
              productId: id,
              label: item.label,
              quantity: item.quantity,
              details: item.details ?? null,
              position,
            })),
          });
        }

        if (dto.images) {
          await tx.shopProductImage.deleteMany({ where: { productId: id } });
          await tx.shopProductImage.createMany({
            data: dto.images.map((image, position) => ({
              productId: id,
              mediaId: image.mediaId,
              alt: image.alt ?? '',
              position,
            })),
          });
        }
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002'))
        throw uniqueConflict(error as Prisma.PrismaClientKnownRequestError);
      throw error;
    }
    await this.changed(actorId, id);
    return this.get(id);
  }

  /** Suppression logique : masqué, slug libéré, variantes désactivées ; l'historique reste. */
  async remove(id: string, actorId: string): Promise<void> {
    const product = await this.prisma.shopProduct.findFirst({
      where: { id, deletedAt: null },
      select: { slug: true },
    });
    if (!product) throw notFound('Produit introuvable.');
    await this.prisma.$transaction([
      this.prisma.shopProduct.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          visible: false,
          slug: `${product.slug.slice(0, 120)}-supprime-${id.slice(-8)}`,
        },
      }),
      this.prisma.shopVariant.updateMany({ where: { productId: id }, data: { active: false } }),
    ]);
    await this.changed(actorId, id);
  }

  async reorder(ids: string[], actorId: string): Promise<AdminShopProductDto[]> {
    const rows = await this.prisma.shopProduct.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { kind: true },
    });
    if (rows.length !== ids.length) throw fieldError('ids', 'contient un produit inconnu');
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.shopProduct.update({ where: { id }, data: { position } }),
      ),
    );
    await this.changed(actorId, null);
    return this.list();
  }

  private async assertImages(images: { mediaId: string }[] | undefined): Promise<void> {
    if (!images?.length) return;
    const ids = images.map((image) => image.mediaId);
    if (new Set(ids).size !== ids.length)
      throw fieldError('images', 'contient deux fois la même image');
    const ready = await this.prisma.media.count({
      where: { id: { in: ids }, deletedAt: null, kind: 'image', status: 'ready' },
    });
    if (ready !== ids.length)
      throw fieldError('images', 'contient une image introuvable ou pas encore prête');
  }

  private toAdmin(row: ProductRow): AdminShopProductDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      shortDescription: row.shortDescription,
      descriptionMarkdown: row.descriptionMarkdown,
      variants: row.variants.map(({ stock, ...variant }) => ({
        ...variant,
        onHand: stock?.onHand ?? 0,
        reserved: stock?.reserved ?? 0,
      })),
      composition: row.kitItems,
      images: row.images.map((image) => ({
        mediaId: image.mediaId,
        alt: image.alt,
        previewUrl:
          storedVariants(image.media)
            .filter((variant) => variant.format === 'webp')
            .sort((a, b) => a.width - b.width)[0]?.url ?? null,
      })),
      position: row.position,
      visible: row.visible,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      updatedAt: row.updatedAt,
    };
  }

  private async changed(actorId: string, id: string | null): Promise<void> {
    await this.cache.changed(['shop']);
    await this.audit.log({
      action: AuditAction.SHOP_PRODUCT_CHANGED,
      actorId,
      targetType: 'shop_product',
      targetId: id,
    });
  }
}
