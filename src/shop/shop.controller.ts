import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CSRF_HEADER, CsrfGuard } from '../auth/guards/csrf.guard';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { clientContext } from '../common/auth/client-context';
import { CurrentUser, MaybeUser, OptionalAuth, Public } from '../common/auth/decorators';
import { ErrorResponseDto } from '../common/errors/error-response';
import { SlugParamPipe } from '../content/common/slug-param.pipe';
import type { CartOwner } from './cart/cart.service';
import { CartService } from './cart/cart.service';
import { ShopCatalogService } from './catalog/shop-catalog.service';
import {
  AddCartItemDto,
  CartDto,
  CartQueryDto,
  CheckoutDto,
  CheckoutResultDto,
  SetCartItemDto,
} from './dto/cart.dto';
import {
  KitComparisonDto,
  ShopProductCardDto,
  ShopProductDetailDto,
  ShopProductQueryDto,
} from './dto/catalog.dto';
import { DownloadUrlDto, OrderDto, TrackOrderQueryDto } from './dto/orders.dto';
import { CheckoutService } from './orders/checkout.service';
import { OrdersService } from './orders/orders.service';

export const CART_COOKIE = 'diani_cart';
const CART_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/v1/shop',
  maxAge: 30 * 24 * 3600 * 1000,
};

/** Catalogue : la disponibilité change avec les ventes, cache court (30 s). */
const SHOP_CACHE = Header(
  'Cache-Control',
  'public, max-age=30, s-maxage=30, stale-while-revalidate=60',
);
const NO_STORE = Header('Cache-Control', 'no-store');

const csrfHeader = ApiHeader({
  name: CSRF_HEADER,
  required: true,
  description: 'Valeur quelconque non vide (protection CSRF du cookie de panier)',
});

function readCartCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[CART_COOKIE];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : undefined;
}

/** Connectée : panier du compte ; sinon : panier invité du cookie. */
function cartOwner(user: AuthenticatedUser | undefined, req: Request): CartOwner {
  return user ? { userId: user.id } : { guestToken: readCartCookie(req) };
}

@ApiTags('Boutique')
@Controller('shop')
export class ShopController {
  constructor(
    private readonly catalog: ShopCatalogService,
    private readonly orders: OrdersService,
  ) {}

  @Get('products')
  @Public()
  @SHOP_CACHE
  @ApiOperation({ summary: 'Kits et accessoires (prix, image, disponibilité en direct)' })
  @ApiOkResponse({ type: [ShopProductCardDto] })
  list(@Query() query: ShopProductQueryDto): Promise<ShopProductCardDto[]> {
    return this.catalog.list(query.kind);
  }

  @Get('products/:slug')
  @Public()
  @SHOP_CACHE
  @ApiOperation({
    summary: 'Fiche produit : variantes, composition, photos, SEO, données structurées',
  })
  @ApiOkResponse({ type: ShopProductDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  detail(@Param('slug', SlugParamPipe) slug: string): Promise<ShopProductDetailDto> {
    return this.catalog.detail(slug);
  }

  @Get('kits/comparison')
  @Public()
  @SHOP_CACHE
  @ApiOperation({ summary: 'Tableau comparatif des kits (déduit de leur composition)' })
  @ApiOkResponse({ type: KitComparisonDto })
  comparison(): Promise<KitComparisonDto> {
    return this.catalog.comparison();
  }

  @Get('orders/track')
  @Public()
  @NO_STORE
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Suivi d’une commande par le lien signé reçu par e-mail (sans compte)' })
  @ApiOkResponse({ type: OrderDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  track(@Query() query: TrackOrderQueryDto): Promise<OrderDto> {
    return this.orders.track(query.token);
  }

  @Get('orders/track/invoice')
  @Public()
  @NO_STORE
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Facture d’une commande suivie par lien signé (URL de 5 minutes)' })
  @ApiOkResponse({ type: DownloadUrlDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Facture en préparation' })
  trackedInvoice(@Query() query: TrackOrderQueryDto): Promise<DownloadUrlDto> {
    return this.orders.trackedInvoice(query.token);
  }
}

@ApiTags('Boutique — panier et commande')
@Controller('shop')
@OptionalAuth()
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly checkoutService: CheckoutService,
  ) {}

  @Get('cart')
  @NO_STORE
  @ApiOperation({
    summary: 'Panier (compte ou invité), recalculé par le serveur',
    description: 'Avec `?country=FR`, les options de livraison applicables sont calculées.',
  })
  @ApiOkResponse({ type: CartDto })
  view(
    @Query() query: CartQueryDto,
    @MaybeUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
  ): Promise<CartDto> {
    return this.cart.view(cartOwner(user, req), query.country);
  }

  @Post('cart/items')
  @UseGuards(CsrfGuard)
  @csrfHeader
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajouter au panier (quantité cumulée, plafonnée au stock disponible)' })
  @ApiOkResponse({ type: CartDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Stock insuffisant ou plafond atteint',
  })
  async add(
    @Body() dto: AddCartItemDto,
    @MaybeUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    const { cart, guestToken } = await this.cart.add(
      cartOwner(user, req),
      dto.variantId,
      dto.quantity,
    );
    if (guestToken) res.cookie(CART_COOKIE, guestToken, CART_COOKIE_OPTIONS);
    return cart;
  }

  @Patch('cart/items/:variantId')
  @UseGuards(CsrfGuard)
  @csrfHeader
  @ApiOperation({ summary: 'Modifier une quantité (0 retire l’article)' })
  @ApiOkResponse({ type: CartDto })
  set(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: SetCartItemDto,
    @MaybeUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
  ): Promise<CartDto> {
    return this.cart.set(cartOwner(user, req), variantId, dto.quantity);
  }

  @Delete('cart/items/:variantId')
  @UseGuards(CsrfGuard)
  @csrfHeader
  @ApiOperation({ summary: 'Retirer un article' })
  @ApiOkResponse({ type: CartDto })
  remove(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @MaybeUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
  ): Promise<CartDto> {
    return this.cart.set(cartOwner(user, req), variantId, 0);
  }

  @Post('checkout')
  @UseGuards(CsrfGuard)
  @csrfHeader
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @ApiOperation({
    summary: 'Valider le panier : commande « en attente de paiement », stock réservé 15 minutes',
    description:
      'Compte facultatif (e-mail obligatoire sans compte). Prix, frais de port et stock recalculés par le serveur. Le paiement (Stripe, PayPal) suit avec la phase Paiements.',
  })
  @ApiCreatedResponse({ type: CheckoutResultDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Panier modifié ou stock insuffisant',
  })
  checkout(
    @Body() dto: CheckoutDto,
    @MaybeUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
  ): Promise<CheckoutResultDto> {
    return this.checkoutService.checkout(cartOwner(user, req), dto, clientContext(req));
  }
}

@ApiTags('Boutique — panier et commande')
@Controller('shop/cart')
export class CartMergeController {
  constructor(private readonly cart: CartService) {}

  @Post('merge')
  @UseGuards(CsrfGuard)
  @csrfHeader
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Après connexion : fusionner le panier invité (cookie) dans celui du compte',
    description: 'Le cookie du panier invité est ensuite effacé.',
  })
  @ApiOkResponse({ type: CartDto })
  async merge(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    const cart = await this.cart.merge(user.id, readCartCookie(req));
    res.clearCookie(CART_COOKIE, { ...CART_COOKIE_OPTIONS, maxAge: undefined });
    return cart;
  }
}
