import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomToken, sha256Hex } from '../../common/crypto/hash';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PUBLIC_IMAGE_SELECT, toPublicImage } from '../../media/media.types';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { availability, availableQuantity } from '../domain/availability';
import { cartTotals, shippingOptions } from '../domain/pricing';
import type { CartDto, CartLineDto } from '../dto/cart.dto';
import { ShippingService } from '../shipping/shipping.service';
import { LOW_STOCK_DISPLAY, MAX_QUANTITY_PER_ITEM, PICKUP_DETAILS } from '../shop.settings';
import { outOfStock } from '../stock/stock-ledger';

const DAY = 24 * 3600 * 1000;
/** Panier invité : 30 jours après la dernière modification. Panier d'un compte : 1 an. */
const GUEST_CART_DAYS = 30;
const USER_CART_DAYS = 365;

/** Propriétaire d'un panier : compte connecté, ou jeton du cookie (invité). */
export interface CartOwner {
  userId?: string;
  guestToken?: string;
}

/** Ligne de panier lue avec tout ce qu'il faut pour la recalculer. */
const ITEM_SELECT = {
  variantId: true,
  quantity: true,
  variant: {
    select: {
      sku: true,
      label: true,
      priceCents: true,
      weightGrams: true,
      active: true,
      stock: { select: { onHand: true, reserved: true } },
      product: {
        select: {
          slug: true,
          name: true,
          visible: true,
          deletedAt: true,
          images: {
            orderBy: { position: 'asc' },
            take: 1,
            select: { alt: true, media: { select: PUBLIC_IMAGE_SELECT } },
          },
        },
      },
    },
  },
} satisfies Prisma.ShopCartItemSelect;

export type CartItemRow = Prisma.ShopCartItemGetPayload<{ select: typeof ITEM_SELECT }>;

export interface ResolvedLine extends CartLineDto {
  sku: string;
  weightGrams: number;
}

function quantityLimit(max: number): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.QUANTITY_LIMIT,
    `Au plus ${max} exemplaires d’un même article par commande.`,
  );
}

function unavailable(): AppException {
  return new AppException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NOT_FOUND,
    'Cet article n’est plus disponible.',
  );
}

/**
 * Panier : invité (jeton aléatoire en cookie HttpOnly, seule son empreinte est en base) ou
 * connecté (lié au compte), fusionnés à la connexion. Aucun prix n'est stocké ni accepté :
 * chaque lecture recalcule prix, disponibilité, total et options de livraison côté serveur.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly shipping: ShippingService,
  ) {}

  async view(owner: CartOwner, country?: string): Promise<CartDto> {
    const cart = await this.find(owner);
    return this.compute(cart?.id ?? null, country);
  }

  /** Ajoute une quantité (cumulée avec l'existant) ; crée le panier si besoin. */
  async add(
    owner: CartOwner,
    variantId: string,
    quantity: number,
  ): Promise<{ cart: CartDto; guestToken?: string }> {
    const { cartId, guestToken } = await this.findOrCreate(owner);
    const existing = await this.prisma.shopCartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
      select: { quantity: true },
    });
    await this.assertQuantity(variantId, (existing?.quantity ?? 0) + quantity);
    await this.prisma.shopCartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity },
      update: { quantity: { increment: quantity } },
    });
    await this.touch(cartId, owner);
    return { cart: await this.compute(cartId), ...(guestToken ? { guestToken } : {}) };
  }

  /** Fixe la quantité d'une ligne (0 la retire). */
  async set(owner: CartOwner, variantId: string, quantity: number): Promise<CartDto> {
    const cart = await this.find(owner);
    if (!cart) return this.compute(null);
    if (quantity === 0) {
      await this.prisma.shopCartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    } else {
      await this.assertQuantity(variantId, quantity);
      const updated = await this.prisma.shopCartItem.updateMany({
        where: { cartId: cart.id, variantId },
        data: { quantity },
      });
      if (updated.count === 0) throw unavailable();
    }
    await this.touch(cart.id, owner);
    return this.compute(cart.id);
  }

  /**
   * Fusion à la connexion : les lignes du panier invité rejoignent celles du compte (quantités
   * additionnées, plafonnées au maximum par article), puis le panier invité est supprimé.
   */
  async merge(userId: string, guestToken: string | undefined): Promise<CartDto> {
    const guest = guestToken ? await this.find({ guestToken }) : null;
    if (guest) {
      const max = await this.settings.get(MAX_QUANTITY_PER_ITEM);
      const { cartId } = await this.findOrCreate({ userId });
      await this.prisma.$transaction(async (tx) => {
        const items = await tx.shopCartItem.findMany({
          where: { cartId: guest.id },
          select: { variantId: true, quantity: true },
        });
        for (const item of items) {
          const current = await tx.shopCartItem.findUnique({
            where: { cartId_variantId: { cartId, variantId: item.variantId } },
            select: { quantity: true },
          });
          const quantity = Math.min((current?.quantity ?? 0) + item.quantity, max);
          await tx.shopCartItem.upsert({
            where: { cartId_variantId: { cartId, variantId: item.variantId } },
            create: { cartId, variantId: item.variantId, quantity },
            update: { quantity },
          });
        }
        await tx.shopCart.delete({ where: { id: guest.id } });
      });
      await this.touch(cartId, { userId });
    }
    return this.view({ userId });
  }

  async find(owner: CartOwner): Promise<{ id: string } | null> {
    if (owner.userId) {
      return this.prisma.shopCart.findUnique({
        where: { userId: owner.userId },
        select: { id: true },
      });
    }
    if (!owner.guestToken) return null;
    return this.prisma.shopCart.findFirst({
      where: { guestTokenHash: sha256Hex(owner.guestToken), expiresAt: { gt: new Date() } },
      select: { id: true },
    });
  }

  /** Lignes recalculées d'un panier (utilisé aussi par la validation de commande). */
  async lines(cartId: string): Promise<ResolvedLine[]> {
    const [items, max, threshold] = await Promise.all([
      this.prisma.shopCartItem.findMany({
        where: { cartId },
        orderBy: { createdAt: 'asc' },
        select: ITEM_SELECT,
      }),
      this.settings.get(MAX_QUANTITY_PER_ITEM),
      this.settings.get(LOW_STOCK_DISPLAY),
    ]);
    return items.map((item) => this.toLine(item, max, threshold));
  }

  async compute(cartId: string | null, country?: string): Promise<CartDto> {
    const [lines, rates, pickup] = await Promise.all([
      cartId ? this.lines(cartId) : Promise.resolve([]),
      this.shipping.activeRates(),
      this.settings.get(PICKUP_DETAILS),
    ]);
    const sellable = lines.filter((line) => line.issue !== 'unavailable');
    const totals = cartTotals(sellable);
    return {
      items: lines.map(({ sku: _sku, weightGrams: _weight, ...line }) => line),
      itemCount: sellable.reduce((sum, line) => sum + line.quantity, 0),
      subtotalCents: totals.subtotalCents,
      weightGrams: totals.weightGrams,
      shippingOptions:
        sellable.length > 0 ? shippingOptions(rates, { country: country ?? null, ...totals }) : [],
      pickupDetails: pickup || null,
      checkoutReady: lines.length > 0 && lines.every((line) => line.issue === null),
    };
  }

  private toLine(item: CartItemRow, max: number, threshold: number): ResolvedLine {
    const { variant } = item;
    const sellable = variant.active && variant.product.visible && !variant.product.deletedAt;
    const available = sellable ? availableQuantity(variant.stock) : 0;
    const image = variant.product.images[0];
    return {
      variantId: item.variantId,
      sku: variant.sku,
      productSlug: variant.product.slug,
      productName: variant.product.name,
      variantLabel: variant.label,
      image: image ? toPublicImage(image.media, image.alt) : null,
      unitPriceCents: variant.priceCents,
      quantity: item.quantity,
      lineTotalCents: variant.priceCents * item.quantity,
      weightGrams: variant.weightGrams,
      availability: availability(available, threshold),
      maxQuantity: Math.min(max, available),
      issue: !sellable ? 'unavailable' : available < item.quantity ? 'insufficient_stock' : null,
    };
  }

  /** Quantité demandée : article en vente, sous le plafond et dans le disponible. */
  private async assertQuantity(variantId: string, quantity: number): Promise<void> {
    const [variant, max] = await Promise.all([
      this.prisma.shopVariant.findFirst({
        where: { id: variantId, active: true, product: { deletedAt: null, visible: true } },
        select: {
          stock: { select: { onHand: true, reserved: true } },
          product: { select: { name: true } },
        },
      }),
      this.settings.get(MAX_QUANTITY_PER_ITEM),
    ]);
    if (!variant) throw unavailable();
    if (quantity > max) throw quantityLimit(max);
    const available = availableQuantity(variant.stock);
    if (quantity > available) throw outOfStock([{ productName: variant.product.name, available }]);
  }

  private async findOrCreate(owner: CartOwner): Promise<{ cartId: string; guestToken?: string }> {
    const existing = await this.find(owner);
    if (existing) return { cartId: existing.id };
    if (owner.userId) {
      const cart = await this.prisma.shopCart.upsert({
        where: { userId: owner.userId },
        create: { userId: owner.userId, expiresAt: new Date(Date.now() + USER_CART_DAYS * DAY) },
        update: {},
        select: { id: true },
      });
      return { cartId: cart.id };
    }
    const guestToken = randomToken();
    const cart = await this.prisma.shopCart.create({
      data: {
        guestTokenHash: sha256Hex(guestToken),
        expiresAt: new Date(Date.now() + GUEST_CART_DAYS * DAY),
      },
      select: { id: true },
    });
    return { cartId: cart.id, guestToken };
  }

  /** Prolonge la durée de vie du panier à chaque modification. */
  private async touch(cartId: string, owner: CartOwner): Promise<void> {
    const days = owner.userId ? USER_CART_DAYS : GUEST_CART_DAYS;
    await this.prisma.shopCart.update({
      where: { id: cartId },
      data: { expiresAt: new Date(Date.now() + days * DAY) },
    });
  }
}
