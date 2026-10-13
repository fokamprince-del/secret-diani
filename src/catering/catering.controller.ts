import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientContext } from '../common/auth/client-context';
import { Public } from '../common/auth/decorators';
import { ErrorResponseDto } from '../common/errors/error-response';
import { PublicContent } from '../content/common/content.helpers';
import { SlugParamPipe } from '../content/common/slug-param.pipe';
import { CateringCatalogService } from './catalog/catalog.service';
import {
  CateringCatalogDto,
  CateringConditionsDto,
  CateringProductDetailDto,
} from './dto/catalog.dto';
import {
  CateringRequestReceiptDto,
  CateringSlotDto,
  CreateCateringRequestDto,
  CreateOnlineCateringOrderDto,
  SlotQueryDto,
} from './dto/requests.dto';
import { CateringRequestsService } from './requests/requests.service';
import { CateringSlotsService } from './slots/slots.service';

/** Formulaires publics : 3 envois par tranche de 10 minutes et par IP. */
const FORM_LIMIT = Throttle({ default: { limit: 3, ttl: 10 * 60_000 } });

@ApiTags('Traiteur')
@Controller('catering')
export class CateringController {
  constructor(
    private readonly catalog: CateringCatalogService,
    private readonly requests: CateringRequestsService,
    private readonly slots: CateringSlotsService,
  ) {}

  @Get('catalog')
  @PublicContent()
  @ApiOperation({
    summary: 'Catalogue complet (plateaux, à la carte, layer cakes), parfums et conditions',
  })
  @ApiOkResponse({ type: CateringCatalogDto })
  catalogue(): Promise<CateringCatalogDto> {
    return this.catalog.catalog();
  }

  @Get('products/:slug')
  @PublicContent()
  @ApiOperation({ summary: 'Fiche détail d’un produit (SEO, données structurées)' })
  @ApiOkResponse({ type: CateringProductDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  product(@Param('slug', SlugParamPipe) slug: string): Promise<CateringProductDetailDto> {
    return this.catalog.product(slug);
  }

  @Get('conditions')
  @PublicContent()
  @ApiOperation({ summary: 'Conditions de commande (acompte, validation, solde)' })
  @ApiOkResponse({ type: CateringConditionsDto })
  conditions(): Promise<CateringConditionsDto> {
    return this.catalog.conditions();
  }

  @Get('slots')
  @Public()
  @ApiOperation({ summary: 'Créneaux disponibles (commande en ligne uniquement)' })
  @ApiOkResponse({ type: [CateringSlotDto] })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Commande en ligne fermée' })
  availableSlots(@Query() query: SlotQueryDto): Promise<CateringSlotDto[]> {
    return this.slots.listAvailable(query.fulfilment);
  }

  @Post('orders')
  @Public()
  @FORM_LIMIT
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Commander en ligne (parcours avancé, désactivé par défaut)',
    description:
      'Sélection et créneau obligatoires ; le total et l’acompte sont calculés par le serveur. Paiement de l’acompte en ligne : phase Paiements.',
  })
  @ApiCreatedResponse({ type: CateringRequestReceiptDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Commande en ligne fermée' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Créneau complet' })
  order(
    @Body() dto: CreateOnlineCateringOrderDto,
    @Req() req: Request,
  ): Promise<CateringRequestReceiptDto> {
    return this.requests.createOnlineOrder(dto, clientContext(req));
  }
}

@ApiTags('Traiteur')
@Controller('catering-requests')
export class CateringRequestsController {
  constructor(private readonly requests: CateringRequestsService) {}

  @Post()
  @Public()
  @FORM_LIMIT
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Envoyer une demande personnalisée',
    description:
      'Anti-spam : limitation de débit, piège à robots (`website`), Cloudflare Turnstile (`captchaToken`, obligatoire en production). Envoie un accusé de réception à la cliente et une notification à Diani ; renvoie un lien WhatsApp pré-rempli.',
  })
  @ApiCreatedResponse({ type: CateringRequestReceiptDto })
  create(
    @Body() dto: CreateCateringRequestDto,
    @Req() req: Request,
  ): Promise<CateringRequestReceiptDto> {
    return this.requests.createFromForm(dto, clientContext(req));
  }
}
