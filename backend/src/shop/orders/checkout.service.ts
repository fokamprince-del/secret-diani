import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { CaptchaService } from '../../common/captcha/captcha.service';
import type { ClientContext } from '../../common/auth/client-context';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';
import { fieldError } from '../../content/common/content.helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { type CartOwner, CartService } from '../cart/cart.service';
import { orderReference } from '../domain/order-status';
import { cartTotals, shippingOptions } from '../domain/pricing';
import type { CheckoutAddressDto, CheckoutDto, CheckoutResultDto } from '../dto/cart.dto';
import { ShippingService } from '../shipping/shipping.service';
import { RESERVATION_MINUTES } from '../shop.settings';
import { StockLedger } from '../stock/stock-ledger';
import { OrderLinkService } from './order-link.service';

function address(dto: CheckoutAddressDto): Prisma.InputJsonObject {
  return {
    firstName: dto.firstName,
    lastName: dto.lastName,
    line1: dto.line1,
    line2: dto.line2 ?? null,
    postalCode: dto.postalCode,
    city: dto.city,
    country: dto.country,
  };
}

/**
 * Validation du panier : contrôle anti-robot, recalcul complet côté serveur (prix, stock,
 * livraison), création de la commande « en attente de paiement » et réservation du stock pour
 * 15 minutes, le tout dans une transaction (aucune survente, aucune commande à moitié créée).
 * Une nouvelle validation du même panier annule la commande précédente encore en attente.
 */
@Injectable()
export class CheckoutService {
  private readonly termsVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly shipping: ShippingService,
    private readonly ledger: StockLedger,
    private readonly settings: SettingsService,
    private readonly captcha: CaptchaService,
    private readonly links: OrderLinkService,
    private readonly audit: AuditService,
    config: AppConfigService,
  ) {
    this.termsVersion = config.get('TERMS_VERSION');
  }

  async checkout(
    owner: CartOwner,
    dto: CheckoutDto,
    client: ClientContext,
  ): Promise<CheckoutResultDto> {
    await this.captcha.verify(dto.captchaToken, client.ip);

    const cart = await this.cart.find(owner);
    // Revalidation du même panier : la commande précédente encore en attente est annulée et son
    // stock libéré AVANT le recalcul, sinon la cliente se verrait opposer sa propre réservation.
    if (cart) await this.prisma.$transaction((tx) => this.cancelPreviousAttempts(tx, cart.id));
    const lines = cart ? await this.cart.lines(cart.id) : [];
    if (!cart || lines.length === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.CART_EMPTY,
        'Votre panier est vide.',
      );
    }
    const problems = lines.filter((line) => line.issue !== null);
    if (problems.length > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CART_CHANGED,
        'Votre panier a changé (article indisponible ou stock insuffisant). Vérifiez-le avant de commander.',
        problems.map((line) => ({
          field: line.variantId,
          messages: [
            line.issue === 'unavailable'
              ? `« ${line.productName} » n’est plus disponible`
              : `il reste ${line.maxQuantity} « ${line.productName} »`,
          ],
        })),
      );
    }

    const email = await this.customerEmail(owner, dto);
    const totals = cartTotals(lines);
    const rate = (await this.shipping.activeRates()).find(
      (candidate) => candidate.id === dto.shippingRateId,
    );
    if (rate?.method === 'delivery' && !dto.shippingAddress) {
      throw fieldError('shippingAddress', 'indiquez l’adresse de livraison');
    }
    const country = rate?.method === 'delivery' ? dto.shippingAddress!.country : null;
    const option = shippingOptions(rate ? [rate] : [], { country, ...totals })[0];
    if (!rate || !option) {
      throw fieldError(
        'shippingRateId',
        'cette option de livraison n’est pas disponible pour cette adresse',
      );
    }
    const billing =
      dto.billingAddress ?? (rate.method === 'delivery' ? dto.shippingAddress : undefined);
    if (!billing) throw fieldError('billingAddress', 'indiquez l’adresse de facturation');

    const minutes = await this.settings.get(RESERVATION_MINUTES);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + minutes * 60_000);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: owner.userId ?? null,
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone ?? null,
          shippingMethod: rate.method,
          shippingRateName: rate.name,
          shippingAddress: rate.method === 'delivery' ? address(dto.shippingAddress!) : undefined,
          billingAddress: address(billing),
          subtotalCents: totals.subtotalCents,
          shippingCents: option.priceCents,
          totalCents: totals.subtotalCents + option.priceCents,
          customerNote: dto.note ?? null,
          termsAcceptedAt: now,
          termsVersion: this.termsVersion,
          cartId: cart.id,
          reservationExpiresAt: expiresAt,
          items: {
            create: lines.map((line, position) => ({
              kind: 'product' as const,
              variantId: line.variantId,
              sku: line.sku,
              productName: line.productName,
              variantLabel: line.variantLabel,
              unitPriceCents: line.unitPriceCents,
              quantity: line.quantity,
              weightGrams: line.weightGrams,
              position,
            })),
          },
          events: { create: { toStatus: 'pending_payment', actorId: owner.userId ?? null } },
        },
        select: { id: true, number: true, totalCents: true },
      });
      await this.ledger.reserve(
        tx,
        created.id,
        lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          productName: line.productName,
        })),
        expiresAt,
      );
      return created;
    });

    await this.audit.log({
      action: AuditAction.SHOP_ORDER_CREATED,
      actorId: owner.userId ?? null,
      targetType: 'order',
      targetId: order.id,
      ipTruncated: client.ipTruncated,
    });
    return {
      orderId: order.id,
      reference: orderReference(order.number),
      totalCents: order.totalCents,
      reservationExpiresAt: expiresAt,
      trackingToken: this.links.sign(order.id),
    };
  }

  /** Connectée : e-mail du compte ; invitée : e-mail saisi (obligatoire). */
  private async customerEmail(owner: CartOwner, dto: CheckoutDto): Promise<string> {
    if (owner.userId) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: owner.userId },
        select: { email: true },
      });
      return user.email;
    }
    if (!dto.email) throw fieldError('email', 'indiquez votre adresse e-mail');
    return dto.email;
  }

  /** Une seule commande en attente par panier : la précédente est annulée, son stock libéré. */
  private async cancelPreviousAttempts(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<void> {
    const pending = await tx.order.findMany({
      where: { cartId, status: 'pending_payment' },
      select: { id: true },
    });
    for (const previous of pending) {
      const cancelled = await tx.order.updateMany({
        where: { id: previous.id, status: 'pending_payment' },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Remplacée par une nouvelle validation du panier',
          reservationExpiresAt: null,
        },
      });
      if (cancelled.count === 0) continue;
      await this.ledger.release(tx, previous.id);
      await tx.orderEvent.create({
        data: {
          orderId: previous.id,
          fromStatus: 'pending_payment',
          toStatus: 'cancelled',
          note: 'Remplacée par une nouvelle validation du panier',
        },
      });
    }
  }
}
