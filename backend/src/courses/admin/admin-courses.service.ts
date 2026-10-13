import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { ContentCacheService } from '../../content/cache/content-cache.service';
import { fieldError, notFound } from '../../content/common/content.helpers';
import { MarkdownService } from '../../content/markdown/markdown.service';
import { slugify } from '../../content/markdown/slug';
import { PrismaService } from '../../prisma/prisma.service';
import { packFeatures } from '../catalog/courses-catalog.service';
import { percent } from '../domain/courses-domain';
import type {
  CourseStatsDto,
  CreateCourseDto,
  CreateLessonDto,
  CreatePackDto,
  SetQuizDto,
  SetResourcesDto,
  UpdateCourseDto,
  UpdateLessonDto,
  UpdatePackDto,
} from '../dto/admin-courses.dto';

const PACK_SELECT = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  priceCents: true,
  rank: true,
  features: true,
  callsIncluded: true,
  visible: true,
} satisfies Prisma.CoursePackSelect;

export const ADMIN_COURSE_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  descriptionMarkdown: true,
  packId: true,
  coverMediaId: true,
  coverAlt: true,
  featured: true,
  status: true,
  position: true,
  seoTitle: true,
  seoDescription: true,
  updatedAt: true,
  modules: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      title: true,
      position: true,
      lessons: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          videoId: true,
          videoDurationSeconds: true,
          tipsMarkdown: true,
          freePreview: true,
          published: true,
          position: true,
          resources: {
            orderBy: { position: 'asc' },
            select: { id: true, mediaId: true, title: true, watermark: true },
          },
          quiz: {
            select: {
              passScorePercent: true,
              maxAttempts: true,
              questions: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  prompt: true,
                  explanation: true,
                  choices: {
                    orderBy: { position: 'asc' },
                    select: { id: true, label: true, isCorrect: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function conflict(message: string, field: string): AppException {
  return new AppException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message, [
    { field, messages: ['déjà utilisé'] },
  ]);
}

/**
 * Administration des formations : packs, formations (brouillon / publiée), modules, leçons,
 * fiches PDF et quiz, avec réordonnancement (glisser-déposer) et statistiques. Toute
 * modification invalide le cache public et est journalisée.
 */
@Injectable()
export class AdminCoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markdown: MarkdownService,
    private readonly cache: ContentCacheService,
    private readonly audit: AuditService,
  ) {}

  // --- Packs ---------------------------------------------------------------------------------

  async listPacks() {
    const rows = await this.prisma.coursePack.findMany({
      orderBy: { rank: 'asc' },
      select: PACK_SELECT,
    });
    return rows.map((row) => ({ ...row, features: packFeatures(row.features) }));
  }

  async createPack(dto: CreatePackDto, actorId: string) {
    try {
      const pack = await this.prisma.coursePack.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? (slugify(dto.name) || 'pack'),
          summary: dto.summary ?? null,
          priceCents: dto.priceCents,
          rank: dto.rank,
          features: dto.features ?? [],
          callsIncluded: dto.callsIncluded ?? 0,
          visible: dto.visible ?? true,
        },
        select: PACK_SELECT,
      });
      await this.changed(actorId, 'course_pack', pack.id);
      return { ...pack, features: packFeatures(pack.features) };
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('Ce niveau ou cette adresse (slug) est déjà utilisé.', 'rank');
      throw error;
    }
  }

  async updatePack(id: string, dto: UpdatePackDto, actorId: string) {
    try {
      const pack = await this.prisma.coursePack.update({
        where: { id },
        data: dto,
        select: PACK_SELECT,
      });
      await this.changed(actorId, 'course_pack', id);
      return { ...pack, features: packFeatures(pack.features) };
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('Ce niveau ou cette adresse (slug) est déjà utilisé.', 'rank');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw notFound('Pack introuvable.');
      throw error;
    }
  }

  // --- Formations ----------------------------------------------------------------------------

  listCourses() {
    return this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        featured: true,
        position: true,
        pack: { select: { name: true, rank: true } },
        _count: { select: { lessons: true } },
      },
    });
  }

  async getCourse(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      select: ADMIN_COURSE_SELECT,
    });
    if (!course) throw notFound('Formation introuvable.');
    return course;
  }

  async createCourse(dto: CreateCourseDto, actorId: string) {
    await this.assertCourseRefs(dto);
    const position = await this.prisma.course.count({ where: { deletedAt: null } });
    const description = dto.descriptionMarkdown ?? '';
    try {
      const { id } = await this.prisma.course.create({
        data: {
          title: dto.title,
          slug: dto.slug ?? (slugify(dto.title, 160) || 'formation'),
          summary: dto.summary,
          descriptionMarkdown: description,
          descriptionHtml: this.markdown.render(description).html,
          packId: dto.packId,
          coverMediaId: dto.coverMediaId ?? null,
          coverAlt: dto.coverAlt ?? '',
          featured: dto.featured ?? false,
          seoTitle: dto.seoTitle ?? null,
          seoDescription: dto.seoDescription ?? null,
          position,
        },
        select: { id: true },
      });
      await this.changed(actorId, 'course', id);
      return this.getCourse(id);
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('Cette adresse (slug) est déjà utilisée.', 'slug');
      throw error;
    }
  }

  async updateCourse(id: string, dto: UpdateCourseDto, actorId: string) {
    await this.getCourse(id);
    await this.assertCourseRefs(dto);
    try {
      await this.prisma.course.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
          ...(dto.descriptionMarkdown !== undefined
            ? {
                descriptionMarkdown: dto.descriptionMarkdown,
                descriptionHtml: this.markdown.render(dto.descriptionMarkdown).html,
              }
            : {}),
          ...(dto.packId !== undefined ? { packId: dto.packId } : {}),
          ...(dto.coverMediaId !== undefined ? { coverMediaId: dto.coverMediaId } : {}),
          ...(dto.coverAlt !== undefined ? { coverAlt: dto.coverAlt } : {}),
          ...(dto.featured !== undefined ? { featured: dto.featured } : {}),
          ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
          ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription } : {}),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('Cette adresse (slug) est déjà utilisée.', 'slug');
      throw error;
    }
    await this.changed(actorId, 'course', id);
    return this.getCourse(id);
  }

  /** Publication : refusée pour une formation sans leçon publiée. */
  async setStatus(id: string, status: 'draft' | 'published', actorId: string) {
    const course = await this.getCourse(id);
    if (status === 'published') {
      const lessons = course.modules
        .flatMap((module) => module.lessons)
        .filter((lesson) => lesson.published);
      if (lessons.length === 0)
        throw fieldError('status', 'ajoutez au moins une leçon publiée avant de publier');
    }
    await this.prisma.course.update({ where: { id }, data: { status } });
    await this.changed(actorId, 'course', id);
    return this.getCourse(id);
  }

  /** Suppression logique : refusée si des certificats existent (preuve de formation). */
  async removeCourse(id: string, actorId: string): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      select: { slug: true, _count: { select: { certificates: true } } },
    });
    if (!course) throw notFound('Formation introuvable.');
    if (course._count.certificates > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Des certificats ont été délivrés pour cette formation : dépubliez-la plutôt.',
      );
    }
    await this.prisma.course.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'draft',
        slug: `${course.slug.slice(0, 120)}-supprime-${id.slice(-8)}`,
      },
    });
    await this.changed(actorId, 'course', id);
  }

  async reorderCourses(ids: string[], actorId: string) {
    const count = await this.prisma.course.count({ where: { id: { in: ids }, deletedAt: null } });
    if (count !== ids.length) throw fieldError('ids', 'contient une formation inconnue');
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.course.update({ where: { id }, data: { position } })),
    );
    await this.changed(actorId, 'course', null);
    return this.listCourses();
  }

  // --- Modules -------------------------------------------------------------------------------

  async addModule(courseId: string, title: string, actorId: string) {
    await this.getCourse(courseId);
    const position = await this.prisma.courseModule.count({ where: { courseId } });
    await this.prisma.courseModule.create({ data: { courseId, title, position } });
    await this.changed(actorId, 'course', courseId);
    return this.getCourse(courseId);
  }

  async renameModule(id: string, title: string, actorId: string) {
    const module = await this.prisma.courseModule
      .update({ where: { id }, data: { title }, select: { courseId: true } })
      .catch(() => null);
    if (!module) throw notFound('Module introuvable.');
    await this.changed(actorId, 'course', module.courseId);
    return this.getCourse(module.courseId);
  }

  /** Suppression d'un module vide seulement (les leçons se déplacent ou se suppriment d'abord). */
  async removeModule(id: string, actorId: string) {
    const module = await this.prisma.courseModule.findUnique({
      where: { id },
      select: { courseId: true, _count: { select: { lessons: true } } },
    });
    if (!module) throw notFound('Module introuvable.');
    if (module._count.lessons > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Ce module contient des leçons : déplacez-les ou supprimez-les d’abord.',
      );
    }
    await this.prisma.courseModule.delete({ where: { id } });
    await this.changed(actorId, 'course', module.courseId);
    return this.getCourse(module.courseId);
  }

  async reorderModules(courseId: string, ids: string[], actorId: string) {
    const count = await this.prisma.courseModule.count({ where: { id: { in: ids }, courseId } });
    if (count !== ids.length) throw fieldError('ids', 'contient un module d’une autre formation');
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.courseModule.update({ where: { id }, data: { position } }),
      ),
    );
    await this.changed(actorId, 'course', courseId);
    return this.getCourse(courseId);
  }

  // --- Leçons --------------------------------------------------------------------------------

  async addLesson(moduleId: string, dto: CreateLessonDto, actorId: string) {
    const module = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module) throw notFound('Module introuvable.');
    const position = await this.prisma.lesson.count({ where: { moduleId } });
    const tips = dto.tipsMarkdown ?? '';
    try {
      await this.prisma.lesson.create({
        data: {
          moduleId,
          courseId: module.courseId,
          title: dto.title,
          slug: dto.slug ?? (slugify(dto.title, 160) || 'lecon'),
          summary: dto.summary ?? null,
          videoId: dto.videoId ?? null,
          videoDurationSeconds: dto.videoDurationSeconds ?? null,
          tipsMarkdown: tips,
          tipsHtml: this.markdown.render(tips).html,
          freePreview: dto.freePreview ?? false,
          published: dto.published ?? true,
          position,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('Une leçon de cette formation utilise déjà cette adresse.', 'slug');
      throw error;
    }
    await this.changed(actorId, 'course', module.courseId);
    return this.getCourse(module.courseId);
  }

  async updateLesson(id: string, dto: UpdateLessonDto, actorId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: { courseId: true, moduleId: true },
    });
    if (!lesson) throw notFound('Leçon introuvable.');
    let position: number | undefined;
    if (dto.moduleId && dto.moduleId !== lesson.moduleId) {
      // Déplacement : seulement vers un module de la même formation, placé en fin de module.
      const target = await this.prisma.courseModule.findFirst({
        where: { id: dto.moduleId, courseId: lesson.courseId },
      });
      if (!target) throw fieldError('moduleId', 'module d’une autre formation');
      position = await this.prisma.lesson.count({ where: { moduleId: dto.moduleId } });
    }
    try {
      await this.prisma.lesson.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
          ...(dto.videoId !== undefined ? { videoId: dto.videoId } : {}),
          ...(dto.videoDurationSeconds !== undefined
            ? { videoDurationSeconds: dto.videoDurationSeconds }
            : {}),
          ...(dto.tipsMarkdown !== undefined
            ? {
                tipsMarkdown: dto.tipsMarkdown,
                tipsHtml: this.markdown.render(dto.tipsMarkdown).html,
              }
            : {}),
          ...(dto.freePreview !== undefined ? { freePreview: dto.freePreview } : {}),
          ...(dto.published !== undefined ? { published: dto.published } : {}),
          ...(position !== undefined ? { moduleId: dto.moduleId, position } : {}),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw conflict('Une leçon de cette formation utilise déjà cette adresse.', 'slug');
      throw error;
    }
    await this.changed(actorId, 'course', lesson.courseId);
    return this.getCourse(lesson.courseId);
  }

  async removeLesson(id: string, actorId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      select: { courseId: true },
    });
    if (!lesson) throw notFound('Leçon introuvable.');
    await this.prisma.lesson.delete({ where: { id } });
    await this.changed(actorId, 'course', lesson.courseId);
    return this.getCourse(lesson.courseId);
  }

  async reorderLessons(moduleId: string, ids: string[], actorId: string) {
    const module = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });
    if (!module) throw notFound('Module introuvable.');
    const count = await this.prisma.lesson.count({ where: { id: { in: ids }, moduleId } });
    if (count !== ids.length) throw fieldError('ids', 'contient une leçon d’un autre module');
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.lesson.update({ where: { id }, data: { position } })),
    );
    await this.changed(actorId, 'course', module.courseId);
    return this.getCourse(module.courseId);
  }

  // --- Fiches et quiz ------------------------------------------------------------------------

  async setResources(lessonId: string, dto: SetResourcesDto, actorId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true },
    });
    if (!lesson) throw notFound('Leçon introuvable.');
    const mediaIds = dto.resources.map((resource) => resource.mediaId);
    const documents = await this.prisma.media.count({
      where: { id: { in: mediaIds }, kind: 'document', status: 'ready', deletedAt: null },
    });
    if (documents !== new Set(mediaIds).size)
      throw fieldError('resources', 'chaque fiche doit être un PDF prêt de la médiathèque');
    await this.prisma.$transaction([
      this.prisma.lessonResource.deleteMany({ where: { lessonId } }),
      this.prisma.lessonResource.createMany({
        data: dto.resources.map((resource, position) => ({
          lessonId,
          mediaId: resource.mediaId,
          title: resource.title,
          watermark: resource.watermark ?? false,
          position,
        })),
      }),
    ]);
    await this.changed(actorId, 'course', lesson.courseId);
    return this.getCourse(lesson.courseId);
  }

  /** Quiz complet (remplace l'existant) : chaque question a au moins une bonne réponse. */
  async setQuiz(lessonId: string, dto: SetQuizDto, actorId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true },
    });
    if (!lesson) throw notFound('Leçon introuvable.');
    dto.questions.forEach((question, index) => {
      if (!question.choices.some((choice) => choice.isCorrect)) {
        throw fieldError(`questions.${index}.choices`, 'indiquez au moins une bonne réponse');
      }
    });
    await this.prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.upsert({
        where: { lessonId },
        create: {
          lessonId,
          passScorePercent: dto.passScorePercent ?? 70,
          maxAttempts: dto.maxAttempts ?? null,
        },
        update: {
          ...(dto.passScorePercent !== undefined ? { passScorePercent: dto.passScorePercent } : {}),
          ...(dto.maxAttempts !== undefined ? { maxAttempts: dto.maxAttempts } : {}),
        },
        select: { id: true },
      });
      await tx.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
      for (const [position, question] of dto.questions.entries()) {
        await tx.quizQuestion.create({
          data: {
            quizId: quiz.id,
            prompt: question.prompt,
            explanation: question.explanation ?? null,
            position,
            choices: {
              create: question.choices.map((choice, index) => ({
                label: choice.label,
                isCorrect: choice.isCorrect,
                position: index,
              })),
            },
          },
        });
      }
    });
    await this.changed(actorId, 'course', lesson.courseId);
    return this.getCourse(lesson.courseId);
  }

  async removeQuiz(lessonId: string, actorId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { courseId: true },
    });
    if (!lesson) throw notFound('Leçon introuvable.');
    await this.prisma.quiz.deleteMany({ where: { lessonId } });
    await this.changed(actorId, 'course', lesson.courseId);
    return this.getCourse(lesson.courseId);
  }

  // --- Statistiques --------------------------------------------------------------------------

  /** Par formation : inscrites (accès actif à un pack suffisant), commencées, terminées. */
  async stats(now = new Date()): Promise<CourseStatsDto[]> {
    const [courses, accesses, started, certificates] = await Promise.all([
      this.prisma.course.findMany({
        where: { deletedAt: null },
        orderBy: { position: 'asc' },
        select: { id: true, title: true, pack: { select: { rank: true } } },
      }),
      this.prisma.courseAccess.findMany({
        where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { userId: true, pack: { select: { rank: true } } },
      }),
      this.prisma.lessonProgress.findMany({
        distinct: ['userId', 'lessonId'],
        select: { userId: true, lesson: { select: { courseId: true } } },
      }),
      this.prisma.certificate.groupBy({
        by: ['courseId'],
        where: { revokedAt: null },
        _count: { _all: true },
      }),
    ]);
    return courses.map((course) => {
      const enrolled = new Set(
        accesses
          .filter((access) => access.pack.rank >= course.pack.rank)
          .map((access) => access.userId),
      );
      const begun = new Set(
        started.filter((row) => row.lesson.courseId === course.id).map((row) => row.userId),
      );
      const completed = certificates.find((row) => row.courseId === course.id)?._count._all ?? 0;
      return {
        courseId: course.id,
        title: course.title,
        enrolled: enrolled.size,
        started: begun.size,
        completed,
        completionRate: percent(completed, enrolled.size),
      };
    });
  }

  // --- Interne -------------------------------------------------------------------------------

  private async assertCourseRefs(dto: UpdateCourseDto): Promise<void> {
    if (dto.packId) {
      const pack = await this.prisma.coursePack.count({ where: { id: dto.packId } });
      if (pack === 0) throw fieldError('packId', 'pack introuvable');
    }
    if (dto.coverMediaId) {
      const media = await this.prisma.media.count({
        where: { id: dto.coverMediaId, kind: 'image', status: 'ready', deletedAt: null },
      });
      if (media === 0) throw fieldError('coverMediaId', 'image introuvable ou pas encore prête');
    }
  }

  private async changed(
    actorId: string,
    targetType: string,
    targetId: string | null,
  ): Promise<void> {
    await this.cache.changed(['courses']);
    await this.audit.log({
      action: AuditAction.COURSE_CATALOG_CHANGED,
      actorId,
      targetType,
      targetId,
    });
  }
}
