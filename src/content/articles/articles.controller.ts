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
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiMovedPermanentlyResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { API_PREFIX } from '../../bootstrap';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { ErrorResponseDto } from '../../common/errors/error-response';
import { PublicContent } from '../common/content.helpers';
import { ArticleDetailDto, ArticleListDto } from '../common/content-responses.dto';
import { SlugParamPipe } from '../common/slug-param.pipe';
import { type AdminArticle, ArticlesService } from './articles.service';
import {
  AdminArticleDto,
  AdminArticleListDto,
  AdminArticleQueryDto,
  CreateArticleDto,
  PublicArticleQueryDto,
  PublishArticleDto,
  UpdateArticleDto,
} from './dto/article.dto';

@ApiTags('Contenus — articles (Conseils & astuces)')
@Controller('content/articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @PublicContent()
  @ApiOperation({
    summary: 'Articles publiés, du plus récent au plus ancien (filtre par catégorie)',
  })
  @ApiOkResponse({ type: ArticleListDto })
  list(@Query() query: PublicArticleQueryDto): Promise<ArticleListDto> {
    return this.articles.listPublic(query);
  }

  @Get(':slug')
  @PublicContent()
  @ApiOperation({
    summary: 'Article publié',
    description:
      'Ancienne adresse d’un article : réponse 301 vers la nouvelle (en-tête Location, X-Canonical-Slug).',
  })
  @ApiOkResponse({ type: ArticleDetailDto })
  @ApiMovedPermanentlyResponse({ description: 'L’article a changé d’adresse' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async get(
    @Param('slug', SlugParamPipe) slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ArticleDetailDto | { redirectSlug: string }> {
    const result = await this.articles.getPublic(slug);
    if (result.kind === 'redirect') {
      res.status(HttpStatus.MOVED_PERMANENTLY);
      res.setHeader('Location', `/${API_PREFIX}/content/articles/${result.slug}`);
      res.setHeader('X-Canonical-Slug', result.slug);
      return { redirectSlug: result.slug };
    }
    return result.article;
  }
}

@ApiTags('Administration — articles')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/articles')
export class AdminArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @ApiOperation({ summary: 'Tous les articles (brouillons, programmés, publiés)' })
  @ApiOkResponse({ type: AdminArticleListDto })
  list(
    @Query() query: AdminArticleQueryDto,
  ): Promise<{ items: AdminArticle[]; nextCursor: string | null }> {
    return this.articles.listAdmin(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminArticleDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminArticle> {
    return this.articles.getAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un article (brouillon)' })
  @ApiCreatedResponse({ type: AdminArticleDto })
  create(
    @Body() dto: CreateArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminArticle> {
    return this.articles.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un article (un article publié garde son ancienne adresse)' })
  @ApiOkResponse({ type: AdminArticleDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminArticle> {
    return this.articles.update(id, dto, user.id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publier maintenant ou programmer (date future)' })
  @ApiOkResponse({ type: AdminArticleDto })
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PublishArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminArticle> {
    return this.articles.publish(id, dto.publishAt, user.id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Repasser en brouillon' })
  @ApiOkResponse({ type: AdminArticleDto })
  unpublish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminArticle> {
    return this.articles.unpublish(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.articles.remove(id, user.id);
  }
}
