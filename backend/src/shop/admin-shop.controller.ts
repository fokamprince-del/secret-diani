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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../common/auth/decorators';
import { CursorQueryDto } from '../common/pagination/cursor';
import { ReorderDto } from '../content/common/content.helpers';
import { AdminShopProductsService } from './catalog/admin-products.service';
import {
  AdjustStockDto,
  AdminShopProductDto,
  AdminShopProductQueryDto,
  AdminStockDto,
  CreateShippingRateDto,
  CreateShopProductDto,
  ShippingRateDto,
  StockMovementDto,
  StockThresholdDto,
  UpdateShippingRateDto,
  UpdateShopProductDto,
} from './dto/admin.dto';
import {
  AdminOrderDto,
  AdminOrderExportQueryDto,
  AdminOrderListDto,
  AdminOrderQueryDto,
  ChangeOrderStatusDto,
  DownloadUrlDto,
  OrderDto,
  OrderListDto,
} from './dto/orders.dto';
import { InvoicesService } from './invoices/invoices.service';
import { OrdersService } from './orders/orders.service';
import { ShippingService } from './shipping/shipping.service';
import { StockService } from './stock/stock.service';

const uuid = () => new ParseUUIDPipe();

@ApiTags('Administration — boutique (catalogue, stock, livraison)')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/shop')
export class AdminShopController {
  constructor(
    private readonly products: AdminShopProductsService,
    private readonly stock: StockService,
    private readonly shipping: ShippingService,
  ) {}

  // --- Produits ------------------------------------------------------------------------------

  @Get('products')
  @ApiOkResponse({ type: [AdminShopProductDto] })
  listProducts(@Query() query: AdminShopProductQueryDto): Promise<AdminShopProductDto[]> {
    return this.products.list(query.kind);
  }

  @Post('products')
  @ApiOperation({ summary: 'Créer un produit ou un kit (variantes, composition, photos)' })
  @ApiCreatedResponse({ type: AdminShopProductDto })
  createProduct(
    @Body() dto: CreateShopProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminShopProductDto> {
    return this.products.create(dto, user.id);
  }

  @Put('products/order')
  @ApiOperation({ summary: 'Réordonner les produits (glisser-déposer)' })
  @ApiOkResponse({ type: [AdminShopProductDto] })
  reorderProducts(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminShopProductDto[]> {
    return this.products.reorder(dto.ids, user.id);
  }

  @Get('products/:id')
  @ApiOkResponse({ type: AdminShopProductDto })
  getProduct(@Param('id', uuid()) id: string): Promise<AdminShopProductDto> {
    return this.products.get(id);
  }

  @Patch('products/:id')
  @ApiOperation({
    summary: 'Modifier un produit (prix, textes, photos, visibilité…)',
    description:
      'Les tableaux fournis remplacent l’existant ; une variante déjà vendue est désactivée, jamais effacée.',
  })
  @ApiOkResponse({ type: AdminShopProductDto })
  updateProduct(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateShopProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminShopProductDto> {
    return this.products.update(id, dto, user.id);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeProduct(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.products.remove(id, user.id);
  }

  // --- Stock ---------------------------------------------------------------------------------

  @Get('stock')
  @ApiOperation({ summary: 'Stock par variante : en stock, réservé, disponible, seuil d’alerte' })
  @ApiOkResponse({ type: [AdminStockDto] })
  listStock(): Promise<AdminStockDto[]> {
    return this.stock.list();
  }

  @Post('stock/:variantId/adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réassort ou inventaire (+/−), historisé' })
  @ApiOkResponse({ type: AdminStockDto })
  adjustStock(
    @Param('variantId', uuid()) variantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminStockDto> {
    return this.stock.adjust(variantId, dto.delta, dto.note, user.id);
  }

  @Put('stock/:variantId/threshold')
  @ApiOperation({ summary: 'Seuil d’alerte « stock bas »' })
  @ApiOkResponse({ type: AdminStockDto })
  setThreshold(
    @Param('variantId', uuid()) variantId: string,
    @Body() dto: StockThresholdDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminStockDto> {
    return this.stock.setThreshold(variantId, dto.lowStockThreshold, user.id);
  }

  @Get('stock/:variantId/movements')
  @ApiOperation({ summary: 'Historique des mouvements (200 derniers)' })
  @ApiOkResponse({ type: [StockMovementDto] })
  movements(@Param('variantId', uuid()) variantId: string): Promise<StockMovementDto[]> {
    return this.stock.movements(variantId);
  }

  // --- Livraison -----------------------------------------------------------------------------

  @Get('shipping-rates')
  @ApiOkResponse({ type: [ShippingRateDto] })
  listRates(): Promise<ShippingRateDto[]> {
    return this.shipping.list();
  }

  @Post('shipping-rates')
  @ApiCreatedResponse({ type: ShippingRateDto })
  createRate(
    @Body() dto: CreateShippingRateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShippingRateDto> {
    return this.shipping.create(dto, user.id);
  }

  @Put('shipping-rates/order')
  @ApiOkResponse({ type: [ShippingRateDto] })
  reorderRates(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShippingRateDto[]> {
    return this.shipping.reorder(dto.ids, user.id);
  }

  @Patch('shipping-rates/:id')
  @ApiOkResponse({ type: ShippingRateDto })
  updateRate(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateShippingRateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShippingRateDto> {
    return this.shipping.update(id, dto, user.id);
  }

  @Delete('shipping-rates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeRate(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.shipping.remove(id, user.id);
  }
}

@ApiTags('Administration — boutique (commandes)')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/shop/orders')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Commandes (filtres : statut, dates, référence, e-mail, nom)' })
  @ApiOkResponse({ type: AdminOrderListDto })
  list(@Query() query: AdminOrderQueryDto): Promise<AdminOrderListDto> {
    return this.orders.listAdmin(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="commandes.csv"')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Export CSV (tableur) des commandes filtrées' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Fichier CSV (séparateur « ; », UTF-8 avec BOM)', type: String })
  export(
    @Query() query: AdminOrderExportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<string> {
    return this.orders.exportCsv(query, user.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminOrderDto })
  get(@Param('id', uuid()) id: string): Promise<AdminOrderDto> {
    return this.orders.getAdmin(id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Étape logistique : en préparation, expédiée (avec suivi), livrée ; annuler une commande non payée',
    description:
      'L’expédition envoie l’e-mail de suivi. « Payée » et « remboursée » sont posés par les paiements.',
  })
  @ApiOkResponse({ type: AdminOrderDto })
  changeStatus(
    @Param('id', uuid()) id: string,
    @Body() dto: ChangeOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminOrderDto> {
    return this.orders.changeStatus(id, dto, user.id);
  }

  @Get(':id/invoice')
  @ApiOperation({ summary: 'Facture PDF (URL signée de 5 minutes)' })
  @ApiOkResponse({ type: DownloadUrlDto })
  invoice(@Param('id', uuid()) id: string): Promise<DownloadUrlDto> {
    return this.invoices.downloadUrl(id);
  }
}

@ApiTags('Compte — commandes')
@ApiBearerAuth()
@Controller('me/orders')
export class MyOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOkResponse({ type: OrderListDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorQueryDto,
  ): Promise<OrderListDto> {
    return this.orders.listMine(user.id, query.cursor, query.limit);
  }

  @Get(':id')
  @ApiOkResponse({ type: OrderDto })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', uuid()) id: string): Promise<OrderDto> {
    return this.orders.getMine(user.id, id);
  }

  @Get(':id/invoice')
  @ApiOperation({ summary: 'Facture PDF (URL signée de 5 minutes)' })
  @ApiOkResponse({ type: DownloadUrlDto })
  invoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid()) id: string,
  ): Promise<DownloadUrlDto> {
    return this.orders.mineInvoice(user.id, id);
  }
}
