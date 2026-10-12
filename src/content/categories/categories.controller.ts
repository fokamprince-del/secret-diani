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
import { PublicContent } from '../common/content.helpers';
import { CategoryDto } from '../common/content-responses.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './categories.dto';
import { CategoriesService } from './categories.service';

@ApiTags('Contenus — articles (Conseils & astuces)')
@Controller('content/article-categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @PublicContent()
  @ApiOperation({ summary: 'Catégories ayant des articles publiés (filtres de la page Conseils)' })
  @ApiOkResponse({ type: [CategoryDto] })
  list(): Promise<CategoryDto[]> {
    return this.categories.listPublic();
  }
}

@ApiTags('Administration — articles')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/article-categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOkResponse({ type: [CategoryDto] })
  list(): Promise<CategoryDto[]> {
    return this.categories.listAdmin();
  }

  @Post()
  @ApiCreatedResponse({ type: CategoryDto })
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryDto> {
    return this.categories.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CategoryDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CategoryDto> {
    return this.categories.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer une catégorie (ses articles restent publiés, sans catégorie)',
  })
  @ApiNoContentResponse()
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.categories.remove(id, user.id);
  }
}
