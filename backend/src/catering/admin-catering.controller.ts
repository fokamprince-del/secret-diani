import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../common/auth/decorators';
import { ReorderDto } from '../content/common/content.helpers';
import { AdminCateringCatalogService } from './catalog/admin-catalog.service';
import {
  AdminCateringCategoryDto,
  AdminCateringProductDto,
  AdminCateringProductQueryDto,
  AdminFlavourDto,
  CreateCateringCategoryDto,
  CreateCateringProductDto,
  CreateFlavourDto,
  UpdateCateringCategoryDto,
  UpdateCateringProductDto,
  UpdateFlavourDto,
} from './dto/admin-catalog.dto';
import {
  AdminCateringRequestDto,
  AdminCateringRequestListDto,
  AdminCateringRequestQueryDto,
  AdminCreateCateringRequestDto,
  AdminSlotDto,
  AdminUpdateCateringRequestDto,
  ChangeRequestStatusDto,
  CreateSlotDto,
  RecapDto,
  RecordDepositDto,
  UpdateSlotDto,
} from './dto/requests.dto';
import { CateringRequestsService } from './requests/requests.service';
import { CateringSlotsService } from './slots/slots.service';

const uuid = () => new ParseUUIDPipe();

@ApiTags('Administration — traiteur (catalogue)')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/catering')
export class AdminCateringCatalogController {
  constructor(
    private readonly catalog: AdminCateringCatalogService,
    private readonly slots: CateringSlotsService,
  ) {}

  // --- Catégories ----------------------------------------------------------------------------

  @Get('categories')
  @ApiOkResponse({ type: [AdminCateringCategoryDto] })
  listCategories(): Promise<AdminCateringCategoryDto[]> {
    return this.catalog.listCategories();
  }

  @Post('categories')
  @ApiCreatedResponse({ type: AdminCateringCategoryDto })
  createCategory(
    @Body() dto: CreateCateringCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringCategoryDto> {
    return this.catalog.createCategory(dto, user.id);
  }

  @Put('categories/order')
  @ApiOperation({ summary: 'Réordonner les catégories (glisser-déposer)' })
  @ApiOkResponse({ type: [AdminCateringCategoryDto] })
  reorderCategories(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringCategoryDto[]> {
    return this.catalog.reorderCategories(dto.ids, user.id);
  }

  @Patch('categories/:id')
  @ApiOkResponse({ type: AdminCateringCategoryDto })
  updateCategory(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateCateringCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringCategoryDto> {
    return this.catalog.updateCategory(id, dto, user.id);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une catégorie vide' })
  @ApiNoContentResponse()
  removeCategory(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.catalog.removeCategory(id, user.id);
  }

  // --- Produits ------------------------------------------------------------------------------

  @Get('products')
  @ApiOkResponse({ type: [AdminCateringProductDto] })
  listProducts(@Query() query: AdminCateringProductQueryDto): Promise<AdminCateringProductDto[]> {
    return this.catalog.listProducts(query.categoryId);
  }

  @Post('products')
  @ApiOperation({ summary: 'Créer un produit (variantes, parfums, galerie)' })
  @ApiCreatedResponse({ type: AdminCateringProductDto })
  createProduct(
    @Body() dto: CreateCateringProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringProductDto> {
    return this.catalog.createProduct(dto, user.id);
  }

  @Put('products/order')
  @ApiOperation({ summary: 'Réordonner les produits d’une catégorie (glisser-déposer)' })
  @ApiOkResponse({ type: [AdminCateringProductDto] })
  reorderProducts(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringProductDto[]> {
    return this.catalog.reorderProducts(dto.ids, user.id);
  }

  @Get('products/:id')
  @ApiOkResponse({ type: AdminCateringProductDto })
  getProduct(@Param('id', uuid()) id: string): Promise<AdminCateringProductDto> {
    return this.catalog.getProduct(id);
  }

  @Patch('products/:id')
  @ApiOperation({
    summary: 'Modifier un produit (prix, textes, visibilité, photos…)',
    description: 'Les tableaux fournis (variantes, parfums, images) remplacent l’existant.',
  })
  @ApiOkResponse({ type: AdminCateringProductDto })
  updateProduct(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateCateringProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringProductDto> {
    return this.catalog.updateProduct(id, dto, user.id);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeProduct(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.catalog.removeProduct(id, user.id);
  }

  // --- Parfums -------------------------------------------------------------------------------

  @Get('flavours')
  @ApiOkResponse({ type: [AdminFlavourDto] })
  listFlavours(): Promise<AdminFlavourDto[]> {
    return this.catalog.listFlavours();
  }

  @Post('flavours')
  @ApiCreatedResponse({ type: AdminFlavourDto })
  createFlavour(
    @Body() dto: CreateFlavourDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminFlavourDto> {
    return this.catalog.createFlavour(dto, user.id);
  }

  @Put('flavours/order')
  @ApiOkResponse({ type: [AdminFlavourDto] })
  reorderFlavours(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminFlavourDto[]> {
    return this.catalog.reorderFlavours(dto.ids, user.id);
  }

  @Patch('flavours/:id')
  @ApiOkResponse({ type: AdminFlavourDto })
  updateFlavour(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateFlavourDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminFlavourDto> {
    return this.catalog.updateFlavour(id, dto, user.id);
  }

  @Delete('flavours/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeFlavour(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.catalog.removeFlavour(id, user.id);
  }

  // --- Créneaux (parcours avancé) ------------------------------------------------------------

  @Get('slots')
  @ApiOperation({ summary: 'Créneaux de retrait et de livraison (à venir et 30 derniers jours)' })
  @ApiOkResponse({ type: [AdminSlotDto] })
  listSlots(): Promise<AdminSlotDto[]> {
    return this.slots.listAdmin();
  }

  @Post('slots')
  @ApiCreatedResponse({ type: AdminSlotDto })
  createSlot(
    @Body() dto: CreateSlotDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminSlotDto> {
    return this.slots.create(dto, user.id);
  }

  @Patch('slots/:id')
  @ApiOkResponse({ type: AdminSlotDto })
  updateSlot(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateSlotDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminSlotDto> {
    return this.slots.update(id, dto, user.id);
  }

  @Delete('slots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeSlot(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.slots.remove(id, user.id);
  }
}

@ApiTags('Administration — traiteur (demandes)')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/catering-requests')
export class AdminCateringRequestsController {
  constructor(private readonly requests: CateringRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Demandes (filtres : statut, dates, référence, e-mail, nom)' })
  @ApiOkResponse({ type: AdminCateringRequestListDto })
  list(@Query() query: AdminCateringRequestQueryDto): Promise<AdminCateringRequestListDto> {
    return this.requests.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Saisir une demande reçue par WhatsApp ou téléphone' })
  @ApiCreatedResponse({ type: AdminCateringRequestDto })
  create(
    @Body() dto: AdminCreateCateringRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringRequestDto> {
    return this.requests.createByAdmin(dto, user.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminCateringRequestDto })
  get(@Param('id', uuid()) id: string): Promise<AdminCateringRequestDto> {
    return this.requests.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier les informations, le total convenu ou les notes internes' })
  @ApiOkResponse({ type: AdminCateringRequestDto })
  update(
    @Param('id', uuid()) id: string,
    @Body() dto: AdminUpdateCateringRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringRequestDto> {
    return this.requests.update(id, dto, user.id);
  }

  @Post(':id/deposit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enregistrer l’acompte reçu',
    description:
      'Montant calculé automatiquement sur le total convenu (10 € sous 50 €, 20 € à partir de 50 €).',
  })
  @ApiOkResponse({ type: AdminCateringRequestDto })
  recordDeposit(
    @Param('id', uuid()) id: string,
    @Body() dto: RecordDepositDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringRequestDto> {
    return this.requests.recordDeposit(id, dto, user.id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Changer le statut (contactée, confirmée, livrée, annulée)',
    description: 'Confirmer exige l’acompte reçu et envoie l’e-mail de confirmation à la cliente.',
  })
  @ApiOkResponse({ type: AdminCateringRequestDto })
  changeStatus(
    @Param('id', uuid()) id: string,
    @Body() dto: ChangeRequestStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminCateringRequestDto> {
    return this.requests.changeStatus(id, dto, user.id);
  }

  @Get(':id/recap')
  @ApiOperation({ summary: 'Récapitulatif prêt à copier (WhatsApp, e-mail)' })
  @ApiOkResponse({ type: RecapDto })
  recap(@Param('id', uuid()) id: string): Promise<RecapDto> {
    return this.requests.recap(id);
  }
}
