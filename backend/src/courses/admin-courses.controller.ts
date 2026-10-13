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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../common/auth/decorators';
import { ReorderDto } from '../content/common/content.helpers';
import { AccessService } from './access/access.service';
import { AdminCoursesService } from './admin/admin-courses.service';
import {
  AccessQueryDto,
  CallRequestQueryDto,
  CourseStatsDto,
  CreateCourseDto,
  CreateLessonDto,
  CreatePackDto,
  GrantAccessDto,
  ModuleInputDto,
  RevokeAccessDto,
  SetQuizDto,
  SetResourcesDto,
  UpdateCallRequestDto,
  UpdateCourseDto,
  UpdateLessonDto,
  UpdatePackDto,
} from './dto/admin-courses.dto';
import { PerksService } from './perks/perks.service';

const uuid = () => new ParseUUIDPipe();

/**
 * Administration des formations. Les réponses d'édition renvoient la formation complète
 * (modules, leçons, fiches, quiz avec les bonnes réponses), prête pour l'écran d'édition.
 */
@ApiTags('Administration — formations')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(
    private readonly courses: AdminCoursesService,
    private readonly access: AccessService,
    private readonly perks: PerksService,
  ) {}

  // --- Packs ---------------------------------------------------------------------------------

  @Get('packs')
  listPacks() {
    return this.courses.listPacks();
  }

  @Post('packs')
  createPack(@Body() dto: CreatePackDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.createPack(dto, user.id);
  }

  @Patch('packs/:id')
  @ApiOperation({ summary: 'Modifier un pack (prix, contenus, appels inclus, visibilité)' })
  updatePack(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdatePackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.updatePack(id, dto, user.id);
  }

  // --- Accès, statistiques, appels (avant les routes « :id ») -------------------------------

  @Get('accesses')
  @ApiOperation({ summary: 'Accès d’une cliente (historique compris)' })
  accesses(@Query() query: AccessQueryDto) {
    return this.access.listForUser(query.userId);
  }

  @Post('accesses')
  @ApiOperation({ summary: 'Offrir ou accorder un accès à un pack (e-mail à la cliente)' })
  grant(@Body() dto: GrantAccessDto, @CurrentUser() user: AuthenticatedUser) {
    return this.access.grant(
      {
        userId: dto.userId,
        packId: dto.packId,
        source: dto.source,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        note: dto.note ?? null,
      },
      user.id,
    );
  }

  @Post('accesses/:id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer un accès' })
  @ApiNoContentResponse()
  revoke(
    @Param('id', uuid()) id: string,
    @Body() dto: RevokeAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.access.revoke(id, dto.note, user.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Inscrites, commencées, terminées et taux de complétion par formation' })
  @ApiOkResponse({ type: [CourseStatsDto] })
  stats(): Promise<CourseStatsDto[]> {
    return this.courses.stats();
  }

  @Get('call-requests')
  @ApiOperation({ summary: 'Demandes d’appel personnalisé' })
  calls(@Query() query: CallRequestQueryDto) {
    return this.perks.listAdmin(query.status);
  }

  @Patch('call-requests/:id')
  updateCall(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateCallRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.perks.update(
      id,
      {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.scheduledAt !== undefined
          ? { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null }
          : {}),
        ...(dto.adminNote !== undefined ? { adminNote: dto.adminNote } : {}),
      },
      user.id,
    );
  }

  // --- Modules, leçons, fiches, quiz ---------------------------------------------------------

  @Patch('modules/:id')
  renameModule(
    @Param('id', uuid()) id: string,
    @Body() dto: ModuleInputDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.renameModule(id, dto.title, user.id);
  }

  @Delete('modules/:id')
  @ApiOperation({ summary: 'Supprimer un module vide' })
  removeModule(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.removeModule(id, user.id);
  }

  @Post('modules/:id/lessons')
  addLesson(
    @Param('id', uuid()) id: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.addLesson(id, dto, user.id);
  }

  @Put('modules/:id/lessons/order')
  @ApiOperation({ summary: 'Réordonner les leçons d’un module (glisser-déposer)' })
  reorderLessons(
    @Param('id', uuid()) id: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.reorderLessons(id, dto.ids, user.id);
  }

  @Patch('lessons/:id')
  @ApiOperation({
    summary: 'Modifier une leçon (vidéo, conseils, publication, déplacement de module)',
  })
  updateLesson(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.updateLesson(id, dto, user.id);
  }

  @Delete('lessons/:id')
  removeLesson(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.removeLesson(id, user.id);
  }

  @Put('lessons/:id/resources')
  @ApiOperation({ summary: 'Fiches PDF de la leçon (liste complète, dans l’ordre)' })
  setResources(
    @Param('id', uuid()) id: string,
    @Body() dto: SetResourcesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.setResources(id, dto, user.id);
  }

  @Put('lessons/:id/quiz')
  @ApiOperation({ summary: 'Quiz de la leçon (remplace l’existant)' })
  setQuiz(
    @Param('id', uuid()) id: string,
    @Body() dto: SetQuizDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.setQuiz(id, dto, user.id);
  }

  @Delete('lessons/:id/quiz')
  removeQuiz(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.removeQuiz(id, user.id);
  }

  // --- Formations ----------------------------------------------------------------------------

  @Get()
  listCourses() {
    return this.courses.listCourses();
  }

  @Post()
  createCourse(@Body() dto: CreateCourseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.createCourse(dto, user.id);
  }

  @Put('order')
  @ApiOperation({ summary: 'Réordonner les formations (glisser-déposer)' })
  reorderCourses(@Body() dto: ReorderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.reorderCourses(dto.ids, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Formation complète (modules, leçons, fiches, quiz avec réponses)' })
  getCourse(@Param('id', uuid()) id: string) {
    return this.courses.getCourse(id);
  }

  @Patch(':id')
  updateCourse(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.updateCourse(id, dto, user.id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.setStatus(id, 'published', user.id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.setStatus(id, 'draft', user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeCourse(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.courses.removeCourse(id, user.id);
  }

  @Post(':id/modules')
  addModule(
    @Param('id', uuid()) id: string,
    @Body() dto: ModuleInputDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.addModule(id, dto.title, user.id);
  }

  @Put(':id/modules/order')
  reorderModules(
    @Param('id', uuid()) id: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.reorderModules(id, dto.ids, user.id);
  }
}
