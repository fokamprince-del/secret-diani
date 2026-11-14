import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { ClientContext } from '../../common/auth/client-context';
import { CaptchaService } from '../../common/captcha/captcha.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';
import { notFound } from '../../content/common/content.helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { COURSE_SALES_OPEN } from '../../settings/site.settings';
import { orderReference } from '../../shop/domain/order-status';
import type { CheckoutResultDto } from '../../shop/dto/cart.dto';
import { OrderLinkService } from '../../shop/orders/order-link.service';
import { AccessService } from '../access/access.service';
import type { PackCheckoutDto } from '../dto/courses.dto';

/** Délai de paiement d'une commande de pack (aucun stock à réserver). */
const PAYMENT_WINDOW_MINUTES = 30;

/**
 * Achat d'un pack de formation (compte obligatoire) : commande « numérique » sans livraison,
 * payée ensuite par /payments/checkout. L'accès n'est créé qu'à la confirmation du paiement
 * (OrdersService.markPaid). Refus si la cliente possède déjà ce pack ou un pack supérieur ;
 * une commande encore en attente pour ce pack est réutilisée (jamais de doublon).
 */
@Injectable()
export class PackCheckoutService {
  private readonly termsVersion: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly captcha: CaptchaService,
    private readonly links: OrderLinkService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    config: AppConfigService,
  ) {
    this.termsVersion = config.get('TERMS_VERSION');
  }

  async checkout(
    packSlug: string,
    dto: PackCheckoutDto,
    user: AuthenticatedUser,
    client: ClientContext,
  ): Promise<CheckoutResultDto> {
    if (!(await this.settings.get(COURSE_SALES_OPEN))) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.FEATURE_DISABLED,
        'Les inscriptions aux formations sont momentanément fermées : elles rouvrent très bientôt.',
      );
    }
    await this.captcha.verify(dto.captchaToken, client.ip);
    const pack = await this.prisma.coursePack.findFirst({
      where: { slug: packSlug, visible: true },
      select: { id: true, name: true, rank: true, priceCents: true },
    });
    if (!pack) throw notFound('Pack introuvable.');
    if (await this.access.canAccess({ id: user.id, role: 'client' }, pack.rank)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.ALREADY_ENROLLED,
        'Vous avez déjà accès à ce pack (ou à un pack qui le comprend).',
      );
    }
    const now = new Date();
    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { email: true, phone: true },
    });
    const billing = dto.billingAddress;
    const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);

    // Idempotence : un verrou par cliente et par pack sérialise deux clics simultanés ; le
    // second retrouve la commande en attente créée par le premier au lieu d'en ouvrir une autre.
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pack-checkout:${user.id}:${pack.id}`}, 0))`;
      const pending = await tx.order.findFirst({
        where: {
          userId: user.id,
          status: 'pending_payment',
          reservationExpiresAt: { gt: new Date(now.getTime() + 5 * 60_000) },
          items: { some: { kind: 'pack', packId: pack.id } },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, totalCents: true, reservationExpiresAt: true },
      });
      if (pending) return { reused: true as const, order: pending };

      const created = await tx.order.create({
        data: {
          userId: user.id,
          email: account.email,
          firstName: billing.firstName,
          lastName: billing.lastName,
          phone: account.phone,
          shippingMethod: 'digital',
          shippingRateName: 'Accès en ligne',
          billingAddress: {
            firstName: billing.firstName,
            lastName: billing.lastName,
            line1: billing.line1,
            line2: billing.line2 ?? null,
            postalCode: billing.postalCode,
            city: billing.city,
            country: billing.country,
          },
          subtotalCents: pack.priceCents,
          shippingCents: 0,
          totalCents: pack.priceCents,
          termsAcceptedAt: now,
          termsVersion: this.termsVersion,
          reservationExpiresAt: expiresAt,
          items: {
            create: {
              kind: 'pack',
              packId: pack.id,
              productName: `Pack ${pack.name}`,
              variantLabel: 'Formation en ligne',
              unitPriceCents: pack.priceCents,
              quantity: 1,
            },
          },
          events: { create: { toStatus: 'pending_payment', actorId: user.id } },
        },
        select: { id: true, number: true, totalCents: true, reservationExpiresAt: true },
      });
      return { reused: false as const, order: created };
    });

    const { order } = outcome;
    if (!outcome.reused) {
      await this.audit.log({
        action: AuditAction.SHOP_ORDER_CREATED,
        actorId: user.id,
        targetType: 'order',
        targetId: order.id,
        ipTruncated: client.ipTruncated,
        metadata: { pack: true },
      });
    }
    return this.result(order.id, order.number, order.totalCents, order.reservationExpiresAt!);
  }

  private result(
    orderId: string,
    number: number,
    totalCents: number,
    expiresAt: Date,
  ): CheckoutResultDto {
    return {
      orderId,
      reference: orderReference(number),
      totalCents,
      reservationExpiresAt: expiresAt,
      trackingToken: this.links.sign(orderId),
    };
  }
}
