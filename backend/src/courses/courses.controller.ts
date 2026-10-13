import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { clientContext } from '../common/auth/client-context';
import { CurrentUser, MaybeUser, OptionalAuth, Public } from '../common/auth/decorators';
import { ErrorResponseDto } from '../common/errors/error-response';
import { PublicContent } from '../content/common/content.helpers';
import { SlugParamPipe } from '../content/common/slug-param.pipe';
import { CheckoutResultDto } from '../shop/dto/cart.dto';
import { DownloadUrlDto } from '../shop/dto/orders.dto';
import { CoursesCatalogService } from './catalog/courses-catalog.service';
import { CertificatesService } from './certificates/certificates.service';
import {
  CallRequestDto,
  CertificateDto,
  CertificateNumberParamDto,
  CertificateVerificationDto,
  CourseCardDto,
  CourseDetailDto,
  CreateCallRequestDto,
  LessonDto,
  MyCourseDetailDto,
  MyCourseDto,
  PackCheckoutDto,
  PackDto,
  PerksDto,
  QuizResultDto,
  SaveProgressDto,
  SubmitQuizDto,
} from './dto/courses.dto';
import { LearningService } from './learning/learning.service';
import { PerksService } from './perks/perks.service';
import { PackCheckoutService } from './purchase/pack-checkout.service';

const uuid = () => new ParseUUIDPipe();

@ApiTags('Formations')
@Controller('courses')
export class CoursesController {
  constructor(
    private readonly catalog: CoursesCatalogService,
    private readonly learning: LearningService,
    private readonly checkout: PackCheckoutService,
  ) {}

  @Get('packs')
  @PublicContent()
  @ApiOperation({ summary: 'Packs (prix, contenus, avantages, formations incluses)' })
  @ApiOkResponse({ type: [PackDto] })
  packs(): Promise<PackDto[]> {
    return this.catalog.packs();
  }

  @Get()
  @PublicContent()
  @ApiOperation({ summary: 'Formations publiées (formations phares en premier)' })
  @ApiOkResponse({ type: [CourseCardDto] })
  list(): Promise<CourseCardDto[]> {
    return this.catalog.list();
  }

  @Get(':slug')
  @PublicContent()
  @ApiOperation({ summary: 'Fiche d’une formation : programme, pack requis, données structurées' })
  @ApiOkResponse({ type: CourseDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  detail(@Param('slug', SlugParamPipe) slug: string): Promise<CourseDetailDto> {
    return this.catalog.detail(slug);
  }

  @Get(':slug/lessons/:lessonSlug')
  @OptionalAuth()
  @ApiOperation({
    summary: 'Leçon : vidéo signée, conseils, fiches, quiz (sans les réponses), progression',
    description:
      'Leçon d’exemple : ouverte à tous. Sinon, compte et pack requis (403 COURSE_ACCESS_REQUIRED, avec le pack à proposer).',
  })
  @ApiOkResponse({ type: LessonDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'Pack requis' })
  lesson(
    @Param('slug', SlugParamPipe) slug: string,
    @Param('lessonSlug', SlugParamPipe) lessonSlug: string,
    @MaybeUser() user: AuthenticatedUser | undefined,
    @Req() req: Request,
  ): Promise<LessonDto> {
    return this.learning.lesson(slug, lessonSlug, user ?? null, clientContext(req).ip);
  }

  @Post('packs/:slug/checkout')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @ApiOperation({
    summary: 'Acheter un pack (compte requis) : commande à payer ensuite par /payments/checkout',
    description: 'L’accès n’est ouvert qu’à la confirmation du paiement par le prestataire.',
  })
  @ApiCreatedResponse({ type: CheckoutResultDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Pack déjà détenu' })
  buy(
    @Param('slug', SlugParamPipe) slug: string,
    @Body() dto: PackCheckoutDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CheckoutResultDto> {
    return this.checkout.checkout(slug, dto, user, clientContext(req));
  }
}

@ApiTags('Compte — formations')
@ApiBearerAuth()
@Controller('me')
export class MyLearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly certificates: CertificatesService,
    private readonly perks: PerksService,
  ) {}

  @Get('courses')
  @ApiOperation({ summary: 'Mes formations : progression et bouton « Reprendre »' })
  @ApiOkResponse({ type: [MyCourseDto] })
  myCourses(@CurrentUser() user: AuthenticatedUser): Promise<MyCourseDto[]> {
    return this.learning.myCourses(user);
  }

  @Get('courses/:slug')
  @ApiOkResponse({ type: MyCourseDetailDto })
  myCourse(
    @Param('slug', SlugParamPipe) slug: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyCourseDetailDto> {
    return this.learning.myCourse(slug, user);
  }

  @Put('lessons/:id/progress')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reprise de lecture (toutes les ~15 s) et fin de vidéo' })
  @ApiOkResponse({
    description: 'Leçon terminée ou non',
    schema: { properties: { completed: { type: 'boolean' } } },
  })
  progress(
    @Param('id', uuid()) id: string,
    @Body() dto: SaveProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ completed: boolean }> {
    return this.learning.saveProgress(id, dto, user);
  }

  @Post('lessons/:id/quiz')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Valider le quiz (correction côté serveur)' })
  @ApiOkResponse({ type: QuizResultDto })
  quiz(
    @Param('id', uuid()) id: string,
    @Body() dto: SubmitQuizDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuizResultDto> {
    return this.learning.submitQuiz(id, dto, user);
  }

  @Get('lessons/:id/resources/:resourceId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Fiche PDF : URL signée de 5 minutes (409 tant qu’une fiche filigranée est en préparation)',
  })
  @ApiOkResponse({ type: DownloadUrlDto })
  resource(
    @Param('id', uuid()) id: string,
    @Param('resourceId', uuid()) resourceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DownloadUrlDto> {
    return this.learning.resource(id, resourceId, user);
  }

  @Get('certificates')
  @ApiOkResponse({ type: [CertificateDto] })
  myCertificates(@CurrentUser() user: AuthenticatedUser): Promise<CertificateDto[]> {
    return this.certificates.listMine(user.id);
  }

  @Get('certificates/:id/download')
  @ApiOkResponse({ type: DownloadUrlDto })
  downloadCertificate(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DownloadUrlDto> {
    return this.certificates.downloadUrl(user.id, id);
  }

  @Post('courses/:slug/certificate')
  @ApiOperation({
    summary: 'Obtenir le certificat d’une formation terminée (nom et prénom requis)',
  })
  @ApiCreatedResponse({ type: CertificateDto })
  claim(
    @Param('slug', SlugParamPipe) slug: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CertificateDto> {
    return this.certificates.claim(user.id, slug);
  }

  @Get('perks')
  @ApiOperation({
    summary: 'Avantages des packs : appels personnalisés restants, fournisseurs offerts…',
  })
  @ApiOkResponse({ type: PerksDto })
  myPerks(@CurrentUser() user: AuthenticatedUser): Promise<PerksDto> {
    return this.perks.perks(user.id);
  }

  @Get('call-requests')
  @ApiOkResponse({ type: [CallRequestDto] })
  myCalls(@CurrentUser() user: AuthenticatedUser): Promise<CallRequestDto[]> {
    return this.perks.listMine(user.id);
  }

  @Post('call-requests')
  @Throttle({ default: { limit: 3, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Demander un appel personnalisé (dans la limite des appels inclus)' })
  @ApiCreatedResponse({ type: CallRequestDto })
  requestCall(
    @Body() dto: CreateCallRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CallRequestDto> {
    return this.perks.requestCall(user.id, dto.message);
  }
}

@ApiTags('Formations')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get(':number')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Vérification publique d’un certificat par son numéro' })
  @ApiOkResponse({ type: CertificateVerificationDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  verify(@Param() params: CertificateNumberParamDto): Promise<CertificateVerificationDto> {
    return this.certificates.verify(params.number);
  }
}
