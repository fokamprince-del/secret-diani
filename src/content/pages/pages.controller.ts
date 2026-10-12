import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { ErrorResponseDto } from '../../common/errors/error-response';
import { PublicContent } from '../common/content.helpers';
import { PageDto, PageLinkDto } from '../common/content-responses.dto';
import { SlugParamPipe } from '../common/slug-param.pipe';
import { AdminPageDto, UpsertPageDto } from './pages.dto';
import { type AdminPage, PagesService } from './pages.service';

@ApiTags('Contenus — pages')
@Controller('content/pages')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  @PublicContent()
  @ApiOperation({ summary: 'Pages publiées (liens du pied de page)' })
  @ApiOkResponse({ type: [PageLinkDto] })
  list(): Promise<PageLinkDto[]> {
    return this.pages.listPublic();
  }

  @Get(':slug')
  @PublicContent()
  @ApiOperation({ summary: 'Page publiée (À propos, mentions légales, CGV, confidentialité…)' })
  @ApiOkResponse({ type: PageDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('slug', SlugParamPipe) slug: string): Promise<PageDto> {
    return this.pages.getPublic(slug);
  }
}

@ApiTags('Administration — pages')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/pages')
export class AdminPagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  @ApiOkResponse({ type: [AdminPageDto] })
  list(): Promise<AdminPage[]> {
    return this.pages.listAdmin();
  }

  @Get(':slug')
  @ApiOkResponse({ type: AdminPageDto })
  get(@Param('slug', SlugParamPipe) slug: string): Promise<AdminPage> {
    return this.pages.getAdmin(slug);
  }

  @Put(':slug')
  @ApiOperation({ summary: 'Créer ou modifier une page (le slug est son adresse sur le site)' })
  @ApiOkResponse({ type: AdminPageDto })
  upsert(
    @Param('slug', SlugParamPipe) slug: string,
    @Body() dto: UpsertPageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminPage> {
    return this.pages.upsert(slug, dto, user.id);
  }
}
