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
import { FaqListDto } from '../common/content-responses.dto';
import { AdminFaqDto, CreateFaqDto, FaqQueryDto, UpdateFaqDto } from './faq.dto';
import { FaqService } from './faq.service';

@ApiTags('Contenus — FAQ')
@Controller('content/faq')
export class FaqController {
  constructor(private readonly faq: FaqService) {}

  @Get()
  @PublicContent()
  @ApiOperation({ summary: 'Questions fréquentes publiées, dans l’ordre choisi' })
  @ApiOkResponse({ type: FaqListDto })
  list(@Query() query: FaqQueryDto): Promise<FaqListDto> {
    return this.faq.listPublic(query.category);
  }
}

@ApiTags('Administration — FAQ')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/faq')
export class AdminFaqController {
  constructor(private readonly faq: FaqService) {}

  @Get()
  @ApiOkResponse({ type: [AdminFaqDto] })
  list(): Promise<AdminFaqDto[]> {
    return this.faq.listAdmin();
  }

  @Post()
  @ApiCreatedResponse({ type: AdminFaqDto })
  create(@Body() dto: CreateFaqDto, @CurrentUser() user: AuthenticatedUser): Promise<AdminFaqDto> {
    return this.faq.create(dto, user.id);
  }

  @Put('order')
  @ApiOperation({ summary: 'Réordonner (glisser-déposer)' })
  @ApiOkResponse({ type: [AdminFaqDto] })
  reorder(@Body() dto: ReorderDto, @CurrentUser() user: AuthenticatedUser): Promise<AdminFaqDto[]> {
    return this.faq.reorder(dto.ids, user.id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AdminFaqDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFaqDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminFaqDto> {
    return this.faq.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.faq.remove(id, user.id);
  }
}
