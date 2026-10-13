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
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { PublicContent, ReorderDto } from '../common/content.helpers';
import { ReviewListDto } from '../common/content-responses.dto';
import {
  AdminReviewDto,
  AdminReviewQueryDto,
  CreateReviewDto,
  ModerateReviewDto,
  PublicReviewQueryDto,
  UpdateReviewDto,
} from './reviews.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Contenus — avis clients (traiteur)')
@Controller('content/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @PublicContent()
  @ApiOperation({ summary: 'Avis approuvés, dans l’ordre choisi, avec la note moyenne' })
  @ApiOkResponse({ type: ReviewListDto })
  list(@Query() query: PublicReviewQueryDto): Promise<ReviewListDto> {
    return this.reviews.listPublic(query.limit);
  }
}

@ApiTags('Administration — avis')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOkResponse({ type: [AdminReviewDto] })
  list(@Query() query: AdminReviewQueryDto): Promise<AdminReviewDto[]> {
    return this.reviews.listAdmin(query.status);
  }

  @Post()
  @ApiOperation({
    summary: 'Saisir un avis reçu (provenance et consentement obligatoires), à modérer',
  })
  @ApiCreatedResponse({ type: AdminReviewDto })
  create(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminReviewDto> {
    return this.reviews.create(dto, user.id);
  }

  @Put('order')
  @ApiOperation({ summary: 'Réordonner (glisser-déposer)' })
  @ApiOkResponse({ type: [AdminReviewDto] })
  reorder(
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminReviewDto[]> {
    return this.reviews.reorder(dto.ids, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un avis (texte ou note modifiés → nouvelle modération)' })
  @ApiOkResponse({ type: AdminReviewDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminReviewDto> {
    return this.reviews.update(id, dto, user.id);
  }

  @Post(':id/moderate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approuver ou refuser un avis' })
  @ApiOkResponse({ type: AdminReviewDto })
  moderate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ModerateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminReviewDto> {
    return this.reviews.moderate(id, dto.decision, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.reviews.remove(id, user.id);
  }
}
