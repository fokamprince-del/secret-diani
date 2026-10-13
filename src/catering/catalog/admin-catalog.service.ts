import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ContentCacheService } from '../../content/cache/content-cache.service';
import { fieldError, notFound } from '../../content/common/content.helpers';
import { slugify } from '../../content/markdown/slug';
import { storedVariants } from '../../media/media.types';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AdminCateringCategoryDto,
  AdminCateringProductDto,
  AdminFlavourDto,
  CreateCateringCategoryDto,
  CreateCateringProductDto,
  CreateFlavourDto,
  UpdateCateringCategoryDto,
  UpdateCateringProductDto,
  UpdateFlavourDto,
  VariantInputDto,
} from '../dto/admin-catalog.dto';
import { parseComposition } from './catalog.service';

const CATEGORY_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  kind: true,
  position: true,
  visible: true,
  _count: { select: { products: { where: { deletedAt: null } } } },
} satisfies Prisma.CateringCategorySelect;

const FLAVOUR_SELECT = {
  id: true,
  slug: true,
  name: true,
  position: true,
  visible: true,
} satisfies Prisma.CateringFlavourSelect;

const PRODUCT_SELECT = {
  id: true,
  categoryId: true,
  slug: true,
  name: true,
  description: true,
  composition: true,
  maxFlavours: true,
  position: true,
  visible: true,
  seoTitle: true,
  seoDescription: true,
  updatedAt: true,
  variants: {
    orderBy: { position: 'asc' },
    select: { id: true, label: true, priceCents: true, servingsMin: true, servingsMax: true },
  },
  flavours: {
    orderBy: { flavour: { position: 'asc' } },
    select: { flavour: { select: { id: true, slug: true, name: true } } },
  },
  images: {
    orderBy: { position: 'asc' },
    select: { mediaId: true, alt: true, media: { select: { variants: true } } },
  },
} satisfies Prisma.CateringProductSelect;

type ProductRow = Prisma.CateringProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

const slugConflict = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.CONFLICT,
    'Cette adresse (slug) est déjà utilisée.',
    [{ field: 'slug', messages: ['déjà utilisée'] }],
  );

function assertServings(variants: VariantInputDto[]): void {
  variants.forEach((variant, index) => {
    const { servingsMin, servingsMax } = variant;
    if (servingsMin && servingsMax && servingsMin > servingsMax) {
      throw fieldError(`variants.${index}.servingsMax`, 'doit être supérieur ou égal au minimum');
    }
  });
}

/**
 * Administration du catalogue traiteur : catégories, produits (variantes, parfums, galerie),
 * parfums. Toute modification invalide le cache public, revalide la page Traiteur du
 * frontend et est journalisée.
 */
@Injectable()
export class AdminCateringCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
  ) {}

  // --- Catégories ----------------------------------------------------------------------------

  async listCategories(): Promise<AdminCateringCategoryDto[]> {
    const rows = await this.prisma.cateringCategory.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: CATEGORY_SELECT,
    });
    return rows.map(({ _count, ...row }) => ({ ...row, productCount: _count.products }));
  }

  async createCategory(
    dto: CreateCateringCategoryDto,
    actorId: string,
  ): Promise<AdminCateringCategoryDto> {
    const position = await this.prisma.cateringCategory.count();
    try {
      const { _count, ...category } = await this.prisma.cateringCategory.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? (slugify(dto.name) || 'categorie'),
          description: dto.description ?? null,
          kind: dto.kind,
          visible: dto.visible ?? true,
          position,
        },
        select: CATEGORY_SELECT,
      });
      await this.changed(actorId, 'catering_category', category.id);
      return { ...category, productCount: _count.products };
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw slugConflict();
      throw error;
    }
  }

  async updateCategory(
    id: string,
    dto: UpdateCateringCategoryDto,
    actorId: string,
  ): Promise<AdminCateringCategoryDto> {
    try {
      const { _count, ...category } = await this.prisma.cateringCategory.update({
        where: { id },
        data: dto,
        select: CATEGORY_SELECT,
      });
      await this.changed(actorId, 'catering_category', id);
      return { ...category, productCount: _count.products };
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw slugConflict();
      if (isPrismaError(error, 'P2025')) throw notFound('Catégorie introuvable.');
      throw error;
    }
  }

  /** Refusée tant que la catégorie contient des produits (même supprimés : historique). */
  async removeCategory(id: string, actorId: string): Promise<void> {
    const products = await this.prisma.cateringProduct.count({ where: { categoryId: id } });
    if (products > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Cette catégorie contient des produits : déplacez-les ou masquez la catégorie.',
      );
    }
    const deleted = await this.prisma.cateringCategory.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound('Catégorie introuvable.');
    await this.changed(actorId, 'catering_category', id);
  }

  async reorderCategories(ids: string[], actorId: string): Promise<AdminCateringCategoryDto[]> {
    const existing = await this.prisma.cateringCategory.count({ where: { id: { in: ids } } });
    if (existing !== ids.length) throw fieldError('ids', 'contient une catégorie inconnue');
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.cateringCategory.update({ where: { id }, data: { position } }),
      ),
    );
    await this.changed(actorId, 'catering_category', null);
    return this.listCategories();
  }

  // --- Parfums -------------------------------------------------------------------------------

  listFlavours(): Promise<AdminFlavourDto[]> {
    return this.prisma.cateringFlavour.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: FLAVOUR_SELECT,
    });
  }

  async createFlavour(dto: CreateFlavourDto, actorId: string): Promise<AdminFlavourDto> {
    const position = await this.prisma.cateringFlavour.count();
    try {
      const flavour = await this.prisma.cateringFlavour.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? (slugify(dto.name) || 'parfum'),
          visible: dto.visible ?? true,
          position,
        },
        select: FLAVOUR_SELECT,
      });
      await this.changed(actorId, 'catering_flavour', flavour.id);
      return flavour;
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw slugConflict();
      throw error;
    }
  }

  async updateFlavour(
    id: string,
    dto: UpdateFlavourDto,
    actorId: string,
  ): Promise<AdminFlavourDto> {
    try {
      const flavour = await this.prisma.cateringFlavour.update({
        where: { id },
        data: dto,
        select: FLAVOUR_SELECT,
      });
      await this.changed(actorId, 'catering_flavour', id);
      return flavour;
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw slugConflict();
      if (isPrismaError(error, 'P2025')) throw notFound('Parfum introuvable.');
      throw error;
    }
  }

  /** Le parfum disparaît des produits ; les demandes passées gardent son nom (figé). */
  async removeFlavour(id: string, actorId: string): Promise<void> {
    const deleted = await this.prisma.cateringFlavour.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound('Parfum introuvable.');
    await this.changed(actorId, 'catering_flavour', id);
  }

  async reorderFlavours(ids: string[], actorId: string): Promise<AdminFlavourDto[]> {
    const existing = await this.prisma.cateringFlavour.count({ where: { id: { in: ids } } });
    if (existing !== ids.length) throw fieldError('ids', 'contient un parfum inconnu');
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.cateringFlavour.update({ where: { id }, data: { position } }),
      ),
    );
    await this.changed(actorId, 'catering_flavour', null);
    return this.listFlavours();
  }

  // --- Produits ------------------------------------------------------------------------------

  async listProducts(categoryId?: string): Promise<AdminCateringProductDto[]> {
    const rows = await this.prisma.cateringProduct.findMany({
      where: { deletedAt: null, ...(categoryId ? { categoryId } : {}) },
      orderBy: [{ categoryId: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      take: 500,
      select: PRODUCT_SELECT,
    });
    return rows.map((row) => this.toAdminProduct(row));
  }

  async getProduct(id: string): Promise<AdminCateringProductDto> {
    const row = await this.prisma.cateringProduct.findFirst({
      where: { id, deletedAt: null },
      select: PRODUCT_SELECT,
    });
    if (!row) throw notFound('Produit introuvable.');
    return this.toAdminProduct(row);
  }

  async createProduct(
    dto: CreateCateringProductDto,
    actorId: string,
  ): Promise<AdminCateringProductDto> {
    assertServings(dto.variants);
    await this.assertReferences(dto);
    if (dto.variants.some((variant) => variant.id)) {
      throw fieldError(
        'variants',
        'un nouveau produit ne peut pas reprendre une variante existante',
      );
    }
    const position = await this.prisma.cateringProduct.count({
      where: { categoryId: dto.categoryId, deletedAt: null },
    });
    let id: string;
    try {
      ({ id } = await this.prisma.cateringProduct.create({
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          slug: dto.slug ?? (slugify(dto.name, 160) || 'produit'),
          description: dto.description ?? null,
          composition: (dto.composition ?? []).map(({ label, quantity }) => ({
            label,
            quantity: quantity ?? null,
          })),
          maxFlavours: dto.maxFlavours ?? 0,
          visible: dto.visible ?? true,
          seoTitle: dto.seoTitle ?? null,
          seoDescription: dto.seoDescription ?? null,
          position,
          variants: {
            create: dto.variants.map((variant, index) => ({
              label: variant.label,
              priceCents: variant.priceCents,
              servingsMin: variant.servingsMin ?? null,
              servingsMax: variant.servingsMax ?? null,
              position: index,
            })),
          },
          flavours: { create: (dto.flavourIds ?? []).map((flavourId) => ({ flavourId })) },
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
      if (isPrismaError(error, 'P2002')) throw slugConflict();
      throw error;
    }
    await this.changed(actorId, 'catering_product', id);
    return this.getProduct(id);
  }

  /**
   * Mise à jour. Les tableaux fournis (variantes, parfums, images) remplacent l'existant :
   * une variante gardée est identifiée par son `id`, une variante absente est supprimée
   * (les demandes passées ont leurs libellés et prix figés, elles ne sont pas touchées).
   */
  async updateProduct(
    id: string,
    dto: UpdateCateringProductDto,
    actorId: string,
  ): Promise<AdminCateringProductDto> {
    await this.getProduct(id);
    if (dto.variants) assertServings(dto.variants);
    await this.assertReferences(dto);
    const variants = dto.variants;
    if (variants) {
      const keptIds = variants.flatMap((variant) => (variant.id ? [variant.id] : []));
      const owned = await this.prisma.cateringVariant.count({
        where: { id: { in: keptIds }, productId: id },
      });
      if (owned !== new Set(keptIds).size || keptIds.length !== new Set(keptIds).size) {
        throw fieldError('variants', 'contient une variante inconnue ou en double');
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.cateringProduct.update({
          where: { id },
          data: {
            ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.composition !== undefined
              ? {
                  composition: dto.composition.map(({ label, quantity }) => ({
                    label,
                    quantity: quantity ?? null,
                  })),
                }
              : {}),
            ...(dto.maxFlavours !== undefined ? { maxFlavours: dto.maxFlavours } : {}),
            ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
            ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
            ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription } : {}),
          },
        });

        if (variants) {
          const keptIds = variants.flatMap((variant) => (variant.id ? [variant.id] : []));
          await tx.cateringVariant.deleteMany({ where: { productId: id, id: { notIn: keptIds } } });
          for (const [position, variant] of variants.entries()) {
            const data = {
              label: variant.label,
              priceCents: variant.priceCents,
              servingsMin: variant.servingsMin ?? null,
              servingsMax: variant.servingsMax ?? null,
              position,
            };
            if (variant.id) {
              await tx.cateringVariant.update({ where: { id: variant.id }, data });
            } else {
              await tx.cateringVariant.create({ data: { ...data, productId: id } });
            }
          }
        }

        if (dto.flavourIds) {
          await tx.cateringProductFlavour.deleteMany({ where: { productId: id } });
          await tx.cateringProductFlavour.createMany({
            data: dto.flavourIds.map((flavourId) => ({ productId: id, flavourId })),
          });
        }

        if (dto.images) {
          await tx.cateringProductImage.deleteMany({ where: { productId: id } });
          await tx.cateringProductImage.createMany({
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
      if (isPrismaError(error, 'P2002')) throw slugConflict();
      throw error;
    }
    await this.changed(actorId, 'catering_product', id);
    return this.getProduct(id);
  }

  /** Suppression logique ; le slug est libéré pour un futur produit. */
  async removeProduct(id: string, actorId: string): Promise<void> {
    const product = await this.prisma.cateringProduct.findFirst({
      where: { id, deletedAt: null },
      select: { slug: true },
    });
    if (!product) throw notFound('Produit introuvable.');
    await this.prisma.cateringProduct.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        visible: false,
        slug: `${product.slug.slice(0, 120)}-supprime-${id.slice(-8)}`,
      },
    });
    await this.changed(actorId, 'catering_product', id);
  }

  async reorderProducts(ids: string[], actorId: string): Promise<AdminCateringProductDto[]> {
    const rows = await this.prisma.cateringProduct.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { categoryId: true },
    });
    if (rows.length !== ids.length) throw fieldError('ids', 'contient un produit inconnu');
    if (new Set(rows.map((row) => row.categoryId)).size > 1) {
      throw fieldError('ids', 'les produits doivent appartenir à la même catégorie');
    }
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.cateringProduct.update({ where: { id }, data: { position } }),
      ),
    );
    await this.changed(actorId, 'catering_product', null);
    return this.listProducts(rows[0]?.categoryId);
  }

  // --- Interne -------------------------------------------------------------------------------

  private async assertReferences(dto: UpdateCateringProductDto): Promise<void> {
    if (dto.categoryId) {
      const category = await this.prisma.cateringCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!category) throw fieldError('categoryId', 'catégorie introuvable');
    }
    if (dto.flavourIds?.length) {
      const found = await this.prisma.cateringFlavour.count({
        where: { id: { in: dto.flavourIds } },
      });
      if (found !== dto.flavourIds.length)
        throw fieldError('flavourIds', 'contient un parfum inconnu');
    }
    if (dto.images?.length) {
      const mediaIds = dto.images.map((image) => image.mediaId);
      if (new Set(mediaIds).size !== mediaIds.length) {
        throw fieldError('images', 'contient deux fois la même image');
      }
      const ready = await this.prisma.media.count({
        where: { id: { in: mediaIds }, deletedAt: null, kind: 'image', status: 'ready' },
      });
      if (ready !== mediaIds.length) {
        throw fieldError('images', 'contient une image introuvable ou pas encore prête');
      }
    }
  }

  private toAdminProduct(row: ProductRow): AdminCateringProductDto {
    return {
      id: row.id,
      categoryId: row.categoryId,
      slug: row.slug,
      name: row.name,
      description: row.description,
      composition: parseComposition(row.composition),
      variants: row.variants,
      maxFlavours: row.maxFlavours,
      flavours: row.flavours.map(({ flavour }) => flavour),
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

  private async changed(
    actorId: string,
    targetType: string,
    targetId: string | null,
  ): Promise<void> {
    await this.cache.changed(['catering']);
    await this.audit.log({
      action: AuditAction.CATERING_CATALOG_CHANGED,
      actorId,
      targetType,
      targetId,
    });
  }
}
