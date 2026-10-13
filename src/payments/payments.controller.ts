import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser, Public, Roles } from '../common/auth/decorators';
import { ErrorResponseDto } from '../common/errors/error-response';
import { notFound } from '../content/common/content.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOrderDto } from '../shop/dto/orders.dto';
import { OrdersService } from '../shop/orders/orders.service';
import {
  AdminPaymentDto,
  CapturePayPalDto,
  CreateRefundDto,
  PaymentMethodsDto,
  PaymentResultDto,
  StartedPaymentDto,
  StartPaymentDto,
  WebhookAckDto,
} from './dto/payments.dto';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { WebhookIpGuard } from './webhooks/webhook-ip.guard';
import { WebhooksService } from './webhooks/webhooks.service';

@ApiTags('Paiements')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
  ) {}

  @Get('methods')
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Moyens de paiement disponibles' })
  @ApiOkResponse({ type: PaymentMethodsDto })
  methods(): PaymentMethodsDto {
    return this.payments.methods();
  }

  @Post('checkout')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @ApiOperation({
    summary: 'Payer une commande : redirection vers Stripe Checkout ou PayPal',
    description:
      'Accès par le jeton signé reçu à la validation du panier. Aucune donnée de carte ne transite par l’API. La commande n’est validée qu’après la confirmation du prestataire.',
  })
  @ApiCreatedResponse({ type: StartedPaymentDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Délai dépassé ou déjà payée' })
  checkout(@Body() dto: StartPaymentDto): Promise<StartedPaymentDto> {
    return this.payments.start(dto.token, dto.provider);
  }

  @Post('paypal/capture')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Retour de PayPal : le serveur capture le paiement validé et confirme la commande',
  })
  @ApiOkResponse({ type: PaymentResultDto })
  async capture(@Body() dto: CapturePayPalDto): Promise<PaymentResultDto> {
    const outcome = await this.payments.capturePayPal(dto.token);
    return { outcome, order: await this.orders.track(dto.token) };
  }
}

@Controller('payments/webhooks')
@Public()
@UseGuards(WebhookIpGuard)
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  stripe(@Req() req: Request): Promise<WebhookAckDto> {
    return this.webhooks.receiveStripe(req.body, req.get('stripe-signature'));
  }

  @Post('paypal')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  paypal(@Req() req: Request): Promise<WebhookAckDto> {
    return this.webhooks.receivePayPal(req.body, {
      authAlgo: req.get('paypal-auth-algo'),
      certUrl: req.get('paypal-cert-url'),
      transmissionId: req.get('paypal-transmission-id'),
      transmissionSig: req.get('paypal-transmission-sig'),
      transmissionTime: req.get('paypal-transmission-time'),
    });
  }
}

@ApiTags('Administration — boutique (commandes)')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/shop/orders')
export class AdminPaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundsService,
    private readonly orders: OrdersService,
  ) {}

  @Get(':id/payments')
  @ApiOperation({ summary: 'Paiements et remboursements d’une commande' })
  @ApiOkResponse({ type: [AdminPaymentDto] })
  async payments(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminPaymentDto[]> {
    const exists = await this.prisma.order.count({ where: { id } });
    if (exists === 0) throw notFound('Commande introuvable.');
    return this.prisma.payment.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        provider: true,
        status: true,
        amountCents: true,
        refundedCents: true,
        providerPaymentId: true,
        succeededAt: true,
        failureReason: true,
        createdAt: true,
        refunds: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            amountCents: true,
            reason: true,
            status: true,
            restocked: true,
            actorId: true,
            failureReason: true,
            createdAt: true,
          },
        },
      },
    });
  }

  @Post(':id/refunds')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rembourser (total ou partiel) chez le prestataire',
    description:
      'Montant contrôlé (jamais plus que le payé moins le remboursé). Un remboursement intégral passe la commande en « remboursée » et peut remettre les articles en stock. La cliente est prévenue par e-mail.',
  })
  @ApiOkResponse({ type: AdminOrderDto })
  async refund(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminOrderDto> {
    await this.refunds.refundOrder(
      id,
      { amountCents: dto.amountCents, reason: dto.reason, restock: dto.restock ?? false },
      user.id,
    );
    return this.orders.getAdmin(id);
  }
}
