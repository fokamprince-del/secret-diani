import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { notFound } from '../../content/common/content.helpers';
import { PUBLIC_IMAGE_SELECT, toPublicImage } from '../../media/media.types';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { type Viewer, AccessService } from '../access/access.service';
import { PUBLISHED_COURSE } from '../catalog/courses-catalog.service';
import { CertificatesService } from '../certificates/certificates.service';
import { gradeQuiz, lessonCompleted, percent, resumeLesson } from '../domain/courses-domain';
import type {
  LessonDto,
  MyCourseDetailDto,
  MyCourseDto,
  QuizResultDto,
  QuizViewDto,
  SaveProgressDto,
  SubmitQuizDto,
} from '../dto/courses.dto';
import { VideoService } from '../video/video.service';
import { WatermarkService } from '../resources/watermark.service';

const LESSON_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  videoId: true,
  videoDurationSeconds: true,
  tipsHtml: true,
  freePreview: true,
  courseId: true,
  module: { select: { title: true } },
  course: {
    select: {
      id: true,
      slug: true,
      title: true,
      pack: { select: { slug: true, name: true, rank: true } },
    },
  },
  resources: {
    where: { media: { deletedAt: null, status: 'ready', kind: 'document' } },
    orderBy: { position: 'asc' },
    select: { id: true, title: true, media: { select: { sizeBytes: true } } },
  },
  quiz: {
    select: {
      id: true,
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
} satisfies Prisma.LessonSelect;

type LessonRow = Prisma.LessonGetPayload<{ select: typeof LESSON_SELECT }>;

/** Leçons publiées d'une formation, dans l'ordre du parcours (modules puis leçons). */
const ORDERED_LESSONS = {
  where: { published: true },
  orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }],
} satisfies Prisma.Course$lessonsArgs;

/**
 * Espace membre des formations : consultation des leçons (accès vérifié à chaque requête,
 * leçon d'exemple ouverte à tous), reprise de lecture, quiz corrigé côté serveur, fiches PDF,
 * progression et déclenchement du certificat.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly video: VideoService,
    private readonly storage: StorageService,
    private readonly watermark: WatermarkService,
    private readonly certificates: CertificatesService,
  ) {}

  // --- Leçon ----------------------------------------------------------------------------------

  /** Leçon d'une formation : payante → accès exigé ; leçon d'exemple → ouverte à tous. */
  async lesson(
    courseSlug: string,
    lessonSlug: string,
    viewer: Viewer | null,
    ip: string,
  ): Promise<LessonDto> {
    const row = await this.findLesson(courseSlug, lessonSlug);
    if (!row.freePreview) {
      if (!viewer) throw this.accountRequired();
      await this.access.require(viewer, row.course.pack);
    }
    const [progress, attempts, ordered] = await Promise.all([
      viewer
        ? this.prisma.lessonProgress.findUnique({
            where: { userId_lessonId: { userId: viewer.id, lessonId: row.id } },
            select: {
              positionSeconds: true,
              videoCompletedAt: true,
              completedAt: true,
              quizBestScore: true,
              quizPassedAt: true,
            },
          })
        : null,
      viewer && row.quiz
        ? this.prisma.quizAttempt.count({ where: { userId: viewer.id, quizId: row.quiz.id } })
        : 0,
      this.prisma.lesson.findMany({
        where: { courseId: row.courseId, published: true },
        orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }],
        select: { slug: true, title: true },
      }),
    ]);
    const index = ordered.findIndex((lesson) => lesson.slug === row.slug);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      course: { slug: row.course.slug, title: row.course.title },
      moduleTitle: row.module.title,
      video: {
        ...this.video.playback(row.videoId, row.videoDurationSeconds, ip),
        durationSeconds: row.videoDurationSeconds,
      },
      tipsHtml: row.tipsHtml,
      resources: row.resources.map((resource) => ({
        id: resource.id,
        title: resource.title,
        sizeBytes: resource.media.sizeBytes,
      })),
      quiz: row.quiz ? this.quizView(row.quiz, attempts, progress) : null,
      progress: viewer
        ? {
            positionSeconds: progress?.positionSeconds ?? 0,
            videoCompleted: Boolean(progress?.videoCompletedAt),
            completed: Boolean(progress?.completedAt),
          }
        : null,
      previous: index > 0 ? ordered[index - 1]! : null,
      next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1]! : null,
    };
  }

  /** Reprise de lecture (appelée toutes les ~15 s, débit limité) et fin de vidéo. */
  async saveProgress(
    lessonId: string,
    dto: SaveProgressDto,
    viewer: Viewer,
  ): Promise<{ completed: boolean }> {
    const lesson = await this.lessonForMember(lessonId, viewer);
    const now = new Date();
    const position = Math.min(
      dto.positionSeconds,
      lesson.videoDurationSeconds ?? dto.positionSeconds,
    );
    const progress = await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: viewer.id, lessonId } },
      create: {
        userId: viewer.id,
        lessonId,
        positionSeconds: position,
        videoCompletedAt: dto.videoCompleted ? now : null,
      },
      update: {
        positionSeconds: position,
        ...(dto.videoCompleted ? { videoCompletedAt: now } : {}),
      },
      select: { videoCompletedAt: true, quizPassedAt: true, completedAt: true },
    });
    return { completed: await this.refreshCompletion(viewer.id, lesson, progress) };
  }

  /** Quiz corrigé côté serveur ; les bonnes réponses ne sont révélées qu'une fois le quiz réussi ou les tentatives épuisées. */
  async submitQuiz(lessonId: string, dto: SubmitQuizDto, viewer: Viewer): Promise<QuizResultDto> {
    const lesson = await this.lessonForMember(lessonId, viewer);
    const quiz = await this.prisma.quiz.findUnique({
      where: { lessonId },
      select: {
        id: true,
        passScorePercent: true,
        maxAttempts: true,
        questions: {
          select: {
            id: true,
            explanation: true,
            choices: { select: { id: true, isCorrect: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!quiz) throw notFound('Cette leçon n’a pas de quiz.');
    const used = await this.prisma.quizAttempt.count({
      where: { userId: viewer.id, quizId: quiz.id },
    });
    if (quiz.maxAttempts !== null && used >= quiz.maxAttempts) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.QUIZ_ATTEMPTS_EXHAUSTED,
        'Vous avez utilisé toutes vos tentatives pour ce quiz.',
      );
    }
    const graded = gradeQuiz(quiz.questions, dto.answers, quiz.passScorePercent);
    const now = new Date();
    const progress = await this.prisma.$transaction(async (tx) => {
      await tx.quizAttempt.create({
        data: {
          userId: viewer.id,
          quizId: quiz.id,
          scorePercent: graded.scorePercent,
          passed: graded.passed,
          answers: dto.answers.map((answer) => ({
            questionId: answer.questionId,
            choiceIds: answer.choiceIds,
          })),
        },
      });
      const current = await tx.lessonProgress.findUnique({
        where: { userId_lessonId: { userId: viewer.id, lessonId } },
        select: { quizBestScore: true, quizPassedAt: true },
      });
      return tx.lessonProgress.upsert({
        where: { userId_lessonId: { userId: viewer.id, lessonId } },
        create: {
          userId: viewer.id,
          lessonId,
          quizBestScore: graded.scorePercent,
          quizPassedAt: graded.passed ? now : null,
        },
        update: {
          quizBestScore: Math.max(current?.quizBestScore ?? 0, graded.scorePercent),
          ...(graded.passed && !current?.quizPassedAt ? { quizPassedAt: now } : {}),
        },
        select: { videoCompletedAt: true, quizPassedAt: true, completedAt: true },
      });
    });
    const remaining = quiz.maxAttempts === null ? null : Math.max(quiz.maxAttempts - used - 1, 0);
    const reveal = graded.passed || remaining === 0 || quiz.maxAttempts === null;
    return {
      scorePercent: graded.scorePercent,
      passed: graded.passed,
      questions: graded.questions.map((question) => ({
        ...question,
        correctChoiceIds: reveal ? question.correctChoiceIds : [],
        explanation: reveal ? question.explanation : null,
      })),
      attemptsRemaining: remaining,
      lessonCompleted: await this.refreshCompletion(viewer.id, lesson, progress),
    };
  }

  /** Fiche PDF : URL signée de 5 minutes, avec filigrane au nom de la cliente si demandé. */
  async resource(lessonId: string, resourceId: string, viewer: Viewer): Promise<{ url: string }> {
    await this.lessonForMember(lessonId, viewer);
    const resource = await this.prisma.lessonResource.findFirst({
      where: {
        id: resourceId,
        lessonId,
        media: { deletedAt: null, status: 'ready', kind: 'document' },
      },
      select: { id: true, title: true, watermark: true, media: { select: { storageKey: true } } },
    });
    if (!resource) throw notFound('Fiche introuvable.');
    const filename = `${resource.title}.pdf`;
    if (resource.watermark) return this.watermark.downloadUrl(resource.id, viewer.id, filename);
    return { url: await this.storage.presignDownload(resource.media.storageKey, filename) };
  }

  // --- Mes formations -------------------------------------------------------------------------

  async myCourses(viewer: Viewer): Promise<MyCourseDto[]> {
    const maxRank = Math.max(0, ...(await this.access.ranks(viewer)));
    if (maxRank === 0) return [];
    const courses = await this.prisma.course.findMany({
      where: { ...PUBLISHED_COURSE, pack: { visible: true, rank: { lte: maxRank } } },
      orderBy: [{ featured: 'desc' }, { position: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        coverAlt: true,
        coverMedia: { select: PUBLIC_IMAGE_SELECT },
        lessons: { ...ORDERED_LESSONS, select: { id: true, slug: true, title: true } },
        certificates: { where: { userId: viewer.id, revokedAt: null }, select: { number: true } },
      },
    });
    const done = await this.completedLessonIds(
      viewer.id,
      courses.flatMap((course) => course.lessons.map((lesson) => lesson.id)),
    );
    return courses.map((course) => {
      const lessons = course.lessons.map((lesson) => ({
        ...lesson,
        completed: done.has(lesson.id),
      }));
      const resume = resumeLesson(lessons);
      return {
        slug: course.slug,
        title: course.title,
        cover: toPublicImage(course.coverMedia, course.coverAlt),
        progressPercent: percent(
          lessons.filter((lesson) => lesson.completed).length,
          lessons.length,
        ),
        resume: resume ? { slug: resume.slug, title: resume.title } : null,
        certificateNumber: course.certificates[0]?.number ?? null,
      };
    });
  }

  async myCourse(slug: string, viewer: Viewer): Promise<MyCourseDetailDto> {
    const course = await this.prisma.course.findFirst({
      where: { ...PUBLISHED_COURSE, slug },
      select: {
        id: true,
        slug: true,
        title: true,
        coverAlt: true,
        coverMedia: { select: PUBLIC_IMAGE_SELECT },
        pack: { select: { slug: true, name: true, rank: true } },
        certificates: { where: { userId: viewer.id, revokedAt: null }, select: { number: true } },
        modules: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            lessons: {
              where: { published: true },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                slug: true,
                title: true,
                videoDurationSeconds: true,
                freePreview: true,
                quiz: { select: { id: true } },
              },
            },
          },
        },
      },
    });
    if (!course) throw notFound('Formation introuvable.');
    await this.access.require(viewer, course.pack);
    const done = await this.completedLessonIds(
      viewer.id,
      course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id)),
    );
    const modules = course.modules.map((module) => {
      const lessons = module.lessons.map((lesson) => ({
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        durationSeconds: lesson.videoDurationSeconds,
        freePreview: lesson.freePreview,
        hasQuiz: lesson.quiz !== null,
        completed: done.has(lesson.id),
      }));
      return {
        id: module.id,
        title: module.title,
        progressPercent: percent(
          lessons.filter((lesson) => lesson.completed).length,
          lessons.length,
        ),
        lessons,
      };
    });
    const all = modules.flatMap((module) => module.lessons);
    const resume = resumeLesson(all);
    return {
      slug: course.slug,
      title: course.title,
      cover: toPublicImage(course.coverMedia, course.coverAlt),
      progressPercent: percent(all.filter((lesson) => lesson.completed).length, all.length),
      resume: resume ? { slug: resume.slug, title: resume.title } : null,
      certificateNumber: course.certificates[0]?.number ?? null,
      modules,
    };
  }

  // --- Interne --------------------------------------------------------------------------------

  private async findLesson(courseSlug: string, lessonSlug: string): Promise<LessonRow> {
    const row = await this.prisma.lesson.findFirst({
      where: {
        slug: lessonSlug,
        published: true,
        course: { ...PUBLISHED_COURSE, slug: courseSlug },
      },
      select: LESSON_SELECT,
    });
    if (!row) throw notFound('Leçon introuvable.');
    return row;
  }

  /** Leçon publiée accessible à la cliente (achat, ou leçon d'exemple). */
  private async lessonForMember(lessonId: string, viewer: Viewer) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, published: true, course: PUBLISHED_COURSE },
      select: {
        id: true,
        courseId: true,
        freePreview: true,
        videoId: true,
        videoDurationSeconds: true,
        quiz: { select: { id: true } },
        course: { select: { pack: { select: { slug: true, name: true, rank: true } } } },
      },
    });
    if (!lesson) throw notFound('Leçon introuvable.');
    if (!lesson.freePreview) await this.access.require(viewer, lesson.course.pack);
    return lesson;
  }

  /** Marque la leçon terminée quand vidéo et quiz sont validés ; déclenche le certificat. */
  private async refreshCompletion(
    userId: string,
    lesson: { id: string; courseId: string; videoId: string | null; quiz: { id: string } | null },
    progress: {
      videoCompletedAt: Date | null;
      quizPassedAt: Date | null;
      completedAt: Date | null;
    },
  ): Promise<boolean> {
    if (progress.completedAt) return true;
    const done = lessonCompleted({
      hasVideo: lesson.videoId !== null,
      hasQuiz: lesson.quiz !== null,
      videoCompletedAt: progress.videoCompletedAt,
      quizPassedAt: progress.quizPassedAt,
    });
    if (!done) return false;
    const marked = await this.prisma.lessonProgress.updateMany({
      where: { userId, lessonId: lesson.id, completedAt: null },
      data: { completedAt: new Date() },
    });
    if (marked.count > 0) await this.certificates.onLessonCompleted(userId, lesson.courseId);
    return true;
  }

  private async completedLessonIds(userId: string, lessonIds: string[]): Promise<Set<string>> {
    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessonIds }, completedAt: { not: null } },
      select: { lessonId: true },
    });
    return new Set(rows.map((row) => row.lessonId));
  }

  private quizView(
    quiz: NonNullable<LessonRow['quiz']>,
    attemptsUsed: number,
    progress: { quizBestScore: number | null; quizPassedAt: Date | null } | null,
  ): QuizViewDto {
    return {
      id: quiz.id,
      passScorePercent: quiz.passScorePercent,
      maxAttempts: quiz.maxAttempts,
      attemptsUsed,
      bestScore: progress?.quizBestScore ?? null,
      passed: Boolean(progress?.quizPassedAt),
      // Les bonnes réponses ne quittent jamais le serveur avant correction.
      questions: quiz.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        multiple: question.choices.filter((choice) => choice.isCorrect).length > 1,
        choices: question.choices.map(({ id, label }) => ({ id, label })),
      })),
    };
  }

  private accountRequired(): AppException {
    return new AppException(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.UNAUTHORIZED,
      'Connectez-vous pour suivre cette formation.',
    );
  }
}
