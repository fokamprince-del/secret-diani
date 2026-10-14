/**
 * Formations de l'API factice. Règles du backend reprises : un pack inclut les packs de rang
 * inférieur ; l'accès n'est ouvert qu'une fois la commande du pack **payée** ; quiz corrigé ici
 * (les bonnes réponses ne sont jamais envoyées avant la validation) ; une leçon d'exemple est
 * consultable sans compte. Pas de vraie vidéo : `hlsUrl` vaut `null` (« vidéo indisponible »).
 *
 * Pour les tests : `POST /__mock/terminer?email=…&formation=…` marque toutes les leçons vues.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { components } from '../../lib/api/schema';
import { bearerEmail, bearerUserId } from './auth.mts';
import { createPackOrder } from './shop.mts';

type S = components['schemas'];
type Send = (
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers?: Record<string, string | string[]>,
) => void;
type Fail = (
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  errors?: unknown,
) => void;

const packs: S['PackDto'][] = [
  {
    id: 'pk1',
    slug: 'essentiel',
    name: 'Essentiel',
    summary: 'Les bases solides de la pâtisserie de fête.',
    priceCents: 2_999,
    rank: 1,
    features: ['Crème au beurre', 'Génoise', 'Lissage', 'Tips secrets'],
    callsIncluded: 0,
    courses: [],
  },
  {
    id: 'pk2',
    slug: 'intermediaire',
    name: 'Intermédiaire',
    summary: 'Les techniques qui font la différence.',
    priceCents: 5_999,
    rank: 2,
    features: [
      'Chantilly brésilienne',
      'Dégradé de couleurs',
      'Pâte hamburger',
      'Tips secrets',
      '2 fournisseurs offerts',
      '1 appel personnalisé',
    ],
    callsIncluded: 1,
    courses: [],
  },
  {
    id: 'pk3',
    slug: 'premium',
    name: 'Premium',
    summary: 'Tout pour en faire une activité.',
    priceCents: 19_999,
    rank: 3,
    features: [
      'Organisation d’un buffet de 200 à 300 personnes',
      'Vendre sur les réseaux',
      'Poche à douille',
      'Liste complète des fournisseurs',
      'Tips secrets',
      '3 appels personnalisés',
      'Contenus des packs précédents',
    ],
    callsIncluded: 3,
    courses: [],
  },
];

interface Lesson {
  id: string;
  slug: string;
  title: string;
  freePreview: boolean;
  durationSeconds: number;
  quiz: {
    questions: {
      id: string;
      prompt: string;
      multiple: boolean;
      choices: { id: string; label: string }[];
      correct: string[];
      explanation: string;
    }[];
  } | null;
}

interface Course {
  slug: string;
  title: string;
  summary: string;
  featured: boolean;
  packSlug: string;
  modules: { id: string; title: string; lessons: Lesson[] }[];
}

const quiz: Lesson['quiz'] = {
  questions: [
    {
      id: 'q1',
      prompt: 'À quelle température le beurre doit-il être travaillé ?',
      multiple: false,
      choices: [
        { id: 'q1a', label: 'Sortant du réfrigérateur' },
        { id: 'q1b', label: 'Pommade, à température ambiante' },
        { id: 'q1c', label: 'Fondu' },
      ],
      correct: ['q1b'],
      explanation: 'Un beurre pommade se fouette sans grumeaux et emprisonne l’air.',
    },
    {
      id: 'q2',
      prompt: 'Quels sucres conviennent à une crème au beurre lisse ?',
      multiple: true,
      choices: [
        { id: 'q2a', label: 'Sucre glace' },
        { id: 'q2b', label: 'Sucre en morceaux' },
        { id: 'q2c', label: 'Sirop de sucre cuit' },
      ],
      correct: ['q2a', 'q2c'],
      explanation: 'Le sucre glace et le sirop se dissolvent ; les morceaux non.',
    },
    {
      id: 'q3',
      prompt: 'Combien de temps fouetter après l’ajout du sucre ?',
      multiple: false,
      choices: [
        { id: 'q3a', label: 'Quelques secondes' },
        { id: 'q3b', label: 'Environ 5 minutes' },
      ],
      correct: ['q3b'],
      explanation: 'Cinq minutes donnent une texture aérienne.',
    },
  ],
};

function course(
  slug: string,
  title: string,
  packSlug: string,
  featured: boolean,
  withPreview = false,
): Course {
  return {
    slug,
    title,
    summary: `Formation de démonstration : ${title.toLowerCase()}.`,
    featured,
    packSlug,
    modules: [
      {
        id: `${slug}-m1`,
        title: 'Les fondamentaux',
        lessons: [
          {
            id: `${slug}-l1`,
            slug: 'les-bases',
            title: 'Les bases',
            freePreview: withPreview,
            durationSeconds: 420,
            quiz: null,
          },
          {
            id: `${slug}-l2`,
            slug: 'la-technique',
            title: 'La technique pas à pas',
            freePreview: false,
            durationSeconds: 780,
            quiz: slug === 'creme-au-beurre' ? quiz : null,
          },
        ],
      },
    ],
  };
}

const courses: Course[] = [
  course('creme-au-beurre', 'Crème au beurre', 'essentiel', true, true),
  course('chantilly-bresilienne', 'Chantilly brésilienne', 'intermediaire', true),
  course('vendre-sur-les-reseaux', 'Vendre sur les réseaux', 'premium', true),
  course('organisation-commande', 'Organiser une commande', 'premium', false),
];

const packBySlug = (slug: string) => packs.find((pack) => pack.slug === slug)!;
for (const pack of packs) {
  pack.courses = courses
    .filter((entry) => packBySlug(entry.packSlug).rank <= pack.rank)
    .map((entry) => ({ slug: entry.slug, title: entry.title }));
}

const packRef = (slug: string): S['PackRefDto'] => {
  const pack = packBySlug(slug);
  return { slug: pack.slug, name: pack.name, rank: pack.rank, priceCents: pack.priceCents };
};

function card(entry: Course): S['CourseCardDto'] {
  const lessons = entry.modules.flatMap((part) => part.lessons);
  return {
    id: entry.slug,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    cover: null,
    featured: entry.featured,
    pack: packRef(entry.packSlug),
    lessonCount: lessons.length,
    durationMinutes: Math.round(
      lessons.reduce((sum, lesson) => sum + lesson.durationSeconds, 0) / 60,
    ),
  };
}

// ---------- Droits, progression, certificats ----------

const access = new Map<string, number>();
const progress = new Map<
  string,
  {
    positionSeconds: number;
    videoCompleted: boolean;
    completed: boolean;
    attempts: number;
    bestScore: number | null;
    passed: boolean;
  }
>();
const certificates: (S['CertificateDto'] & { userId: string; courseSlug: string })[] = [];
const callRequests = new Map<string, S['CallRequestDto'][]>();

const rankOf = (userId: string | null) => (userId ? (access.get(userId) ?? 0) : 0);
const canRead = (userId: string | null, entry: Course) =>
  rankOf(userId) >= packBySlug(entry.packSlug).rank;
const stateOf = (userId: string, lesson: Lesson) => {
  const key = `${userId}:${lesson.id}`;
  let state = progress.get(key);
  if (!state) {
    state = {
      positionSeconds: 0,
      videoCompleted: false,
      completed: false,
      attempts: 0,
      bestScore: null,
      passed: false,
    };
    progress.set(key, state);
  }
  return state;
};
const refresh = (lesson: Lesson, state: ReturnType<typeof stateOf>) => {
  state.completed = state.videoCompleted && (lesson.quiz === null || state.passed);
};

function percent(userId: string, entry: Course): number {
  const lessons = entry.modules.flatMap((part) => part.lessons);
  const done = lessons.filter((lesson) => stateOf(userId, lesson).completed).length;
  return Math.round((done / lessons.length) * 100);
}

function findLesson(lessonId: string) {
  for (const entry of courses) {
    for (const part of entry.modules) {
      const lesson = part.lessons.find((item) => item.id === lessonId);
      if (lesson) return { entry, part, lesson };
    }
  }
  return null;
}

function lessonView(entry: Course, lesson: Lesson, userId: string | null): S['LessonDto'] {
  const flat = entry.modules.flatMap((part) => part.lessons.map((item) => ({ part, item })));
  const index = flat.findIndex(({ item }) => item.id === lesson.id);
  const nav = (position: number) => {
    const target = flat[position]?.item;
    return target ? { slug: target.slug, title: target.title } : null;
  };
  const state = userId ? stateOf(userId, lesson) : null;
  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    summary: 'Résumé de démonstration de la leçon.',
    course: { slug: entry.slug, title: entry.title },
    moduleTitle: flat[index]!.part.title,
    video: { hlsUrl: null, expiresAt: null, durationSeconds: lesson.durationSeconds },
    tipsHtml:
      '<p>Astuce de démonstration : travaillez toujours avec un beurre à température ambiante.</p>',
    resources: [{ id: `${lesson.id}-fiche`, title: 'Fiche recette (PDF)', sizeBytes: 245_000 }],
    quiz: lesson.quiz
      ? {
          id: `${lesson.id}-quiz`,
          passScorePercent: 66,
          maxAttempts: null,
          attemptsUsed: state?.attempts ?? 0,
          bestScore: state?.bestScore ?? null,
          passed: state?.passed ?? false,
          questions: lesson.quiz.questions.map(({ id, prompt, multiple, choices }) => ({
            id,
            prompt,
            multiple,
            choices,
          })),
        }
      : null,
    progress: state
      ? {
          positionSeconds: state.positionSeconds,
          videoCompleted: state.videoCompleted,
          completed: state.completed,
        }
      : null,
    previous: nav(index - 1),
    next: nav(index + 1),
  };
}

function myCourse(userId: string, entry: Course): S['MyCourseDetailDto'] {
  const lessons = entry.modules.flatMap((part) => part.lessons);
  const resume = lessons.find((lesson) => !stateOf(userId, lesson).completed) ?? null;
  return {
    slug: entry.slug,
    title: entry.title,
    cover: null,
    progressPercent: percent(userId, entry),
    resume: resume ? { slug: resume.slug, title: resume.title } : null,
    certificateNumber:
      certificates.find((cert) => cert.userId === userId && cert.courseSlug === entry.slug)
        ?.number ?? null,
    modules: entry.modules.map((part) => ({
      id: part.id,
      title: part.title,
      progressPercent: Math.round(
        (part.lessons.filter((lesson) => stateOf(userId, lesson).completed).length /
          part.lessons.length) *
          100,
      ),
      lessons: part.lessons.map((lesson) => ({
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        durationSeconds: lesson.durationSeconds,
        freePreview: lesson.freePreview,
        hasQuiz: lesson.quiz !== null,
        completed: stateOf(userId, lesson).completed,
      })),
    })),
  };
}

export function completeCourse(
  email: string,
  slug: string,
  userIdFor: (email: string) => string | undefined,
) {
  const userId = userIdFor(email);
  const entry = courses.find((item) => item.slug === slug);
  if (!userId || !entry) return false;
  for (const lesson of entry.modules.flatMap((part) => part.lessons)) {
    const state = stateOf(userId, lesson);
    state.videoCompleted = true;
    state.passed = true;
    refresh(lesson, state);
  }
  return true;
}

export async function handleCourses(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  body: Record<string, unknown>,
  send: Send,
  fail: Fail,
): Promise<boolean> {
  const method = req.method ?? 'GET';
  const userId = bearerUserId(req);
  const needAuth = () => {
    if (!userId)
      fail(res, 401, 'UNAUTHORIZED', 'Votre session a expiré. Reconnectez-vous pour continuer.');
    return !userId;
  };

  if (method === 'GET' && path === '/courses/packs') return (send(res, 200, packs), true);
  if (method === 'GET' && path === '/courses') {
    send(res, 200, [...courses].sort((a, b) => Number(b.featured) - Number(a.featured)).map(card));
    return true;
  }
  const certMatch = /^\/certificates\/([\w-]+)$/.exec(path);
  if (method === 'GET' && certMatch) {
    const cert = certificates.find((entry) => entry.number === certMatch[1]);
    if (!cert) fail(res, 404, 'NOT_FOUND', 'Aucun certificat ne porte ce numéro.');
    else
      send(res, 200, {
        number: cert.number,
        valid: true,
        holderName: cert.holderName,
        courseTitle: cert.courseTitle,
        issuedAt: cert.issuedAt,
      });
    return true;
  }
  const lessonMatch = /^\/courses\/([a-z0-9-]+)\/lessons\/([a-z0-9-]+)$/.exec(path);
  if (method === 'GET' && lessonMatch) {
    const entry = courses.find((item) => item.slug === lessonMatch[1]);
    const lesson = entry?.modules
      .flatMap((part) => part.lessons)
      .find((item) => item.slug === lessonMatch[2]);
    if (!entry || !lesson) fail(res, 404, 'NOT_FOUND', 'Cette leçon est introuvable.');
    else if (!lesson.freePreview && !canRead(userId, entry)) {
      fail(
        res,
        403,
        'PACK_REQUIRED',
        `Cette leçon fait partie du pack ${packBySlug(entry.packSlug).name}.`,
      );
    } else send(res, 200, lessonView(entry, lesson, canRead(userId, entry) ? userId : null));
    return true;
  }
  const courseMatch = /^\/courses\/([a-z0-9-]+)$/.exec(path);
  if (method === 'GET' && courseMatch) {
    const entry = courses.find((item) => item.slug === courseMatch[1]);
    if (!entry) fail(res, 404, 'NOT_FOUND', 'Cette formation est introuvable.');
    else
      send(res, 200, {
        ...card(entry),
        descriptionHtml: `<p>${entry.summary} Description de démonstration.</p>`,
        modules: entry.modules.map((part) => ({
          id: part.id,
          title: part.title,
          lessons: part.lessons.map((lesson) => ({
            id: lesson.id,
            slug: lesson.slug,
            title: lesson.title,
            durationSeconds: lesson.durationSeconds,
            freePreview: lesson.freePreview,
            hasQuiz: lesson.quiz !== null,
          })),
        })),
        seo: {
          title: entry.title,
          description: entry.summary,
          canonicalUrl: `http://localhost:5173/formations/${entry.slug}`,
        },
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: entry.title,
          description: entry.summary,
        },
      } satisfies S['CourseDetailDto']);
    return true;
  }

  const packCheckout = /^\/courses\/packs\/([a-z0-9-]+)\/checkout$/.exec(path);
  if (method === 'POST' && packCheckout) {
    if (needAuth()) return true;
    const pack = packs.find((entry) => entry.slug === packCheckout[1]);
    if (!pack) return (fail(res, 404, 'NOT_FOUND', 'Ce pack est introuvable.'), true);
    if (rankOf(userId) >= pack.rank)
      return (fail(res, 409, 'PACK_OWNED', 'Vous avez déjà accès à ce pack.'), true);
    if (!body.acceptTerms) {
      return (
        fail(res, 400, 'VALIDATION_ERROR', 'Les données envoyées sont invalides.', [
          { field: 'acceptTerms', messages: ['doit être accepté'] },
        ]),
        true
      );
    }
    const result = createPackOrder(userId!, bearerEmail(req) ?? '', pack, () => {
      access.set(userId!, Math.max(rankOf(userId), pack.rank));
    });
    send(res, 201, result);
    return true;
  }

  if (
    !path.startsWith('/me/courses') &&
    !path.startsWith('/me/lessons') &&
    !path.startsWith('/me/certificates') &&
    !path.startsWith('/me/perks') &&
    !path.startsWith('/me/call-requests')
  ) {
    return false;
  }
  if (needAuth()) return true;
  const user = userId!;

  if (method === 'GET' && path === '/me/courses') {
    send(
      res,
      200,
      courses
        .filter((entry) => canRead(user, entry))
        .map((entry) => {
          const { modules: _modules, ...rest } = myCourse(user, entry);
          return rest;
        }),
    );
    return true;
  }
  const myCourseMatch = /^\/me\/courses\/([a-z0-9-]+)(\/certificate)?$/.exec(path);
  if (myCourseMatch) {
    const entry = courses.find((item) => item.slug === myCourseMatch[1]);
    if (!entry || !canRead(user, entry))
      return (fail(res, 404, 'NOT_FOUND', 'Formation introuvable.'), true);
    if (method === 'GET' && !myCourseMatch[2]) return (send(res, 200, myCourse(user, entry)), true);
    if (method === 'POST' && myCourseMatch[2]) {
      if (percent(user, entry) < 100)
        return (
          fail(
            res,
            409,
            'COURSE_NOT_COMPLETED',
            'Terminez toutes les leçons pour obtenir le certificat.',
          ),
          true
        );
      let cert = certificates.find(
        (item) => item.userId === user && item.courseSlug === entry.slug,
      );
      if (!cert) {
        const number = `CERT-2026-${String(certificates.length + 1).padStart(4, '0')}`;
        cert = {
          id: number.toLowerCase(),
          number,
          courseTitle: entry.title,
          holderName: 'Awa Diallo',
          issuedAt: new Date().toISOString(),
          pdfAvailable: true,
          verificationUrl: `http://localhost:5173/certificat/${number}`,
          userId: user,
          courseSlug: entry.slug,
        };
        certificates.push(cert);
      }
      const { userId: _user, courseSlug: _slug, ...view } = cert;
      return (send(res, 201, view), true);
    }
  }
  const lessonAction = /^\/me\/lessons\/([\w-]+)\/(progress|quiz|resources\/([\w-]+))$/.exec(path);
  if (lessonAction) {
    const found = findLesson(lessonAction[1]!);
    if (!found || !canRead(user, found.entry))
      return (fail(res, 403, 'PACK_REQUIRED', 'Accès réservé au pack.'), true);
    const state = stateOf(user, found.lesson);
    if (method === 'PUT' && lessonAction[2] === 'progress') {
      state.positionSeconds = Math.max(0, Number(body.positionSeconds ?? 0));
      if (body.videoCompleted) state.videoCompleted = true;
      refresh(found.lesson, state);
      return (send(res, 200, { completed: state.completed }), true);
    }
    if (method === 'POST' && lessonAction[2] === 'quiz' && found.lesson.quiz) {
      const answers = (body.answers as { questionId: string; choiceIds: string[] }[]) ?? [];
      const graded = found.lesson.quiz.questions.map((question) => {
        const given = answers.find((answer) => answer.questionId === question.id)?.choiceIds ?? [];
        const correct =
          given.length === question.correct.length &&
          question.correct.every((id) => given.includes(id));
        return {
          questionId: question.id,
          correct,
          correctChoiceIds: question.correct,
          explanation: question.explanation,
        };
      });
      const scorePercent = Math.round(
        (graded.filter((entry) => entry.correct).length / graded.length) * 100,
      );
      state.attempts += 1;
      state.bestScore = Math.max(state.bestScore ?? 0, scorePercent);
      if (scorePercent >= 66) state.passed = true;
      refresh(found.lesson, state);
      return (
        send(res, 200, {
          scorePercent,
          passed: scorePercent >= 66,
          questions: graded,
          attemptsRemaining: null,
          lessonCompleted: state.completed,
        } satisfies S['QuizResultDto']),
        true
      );
    }
    if (method === 'GET' && lessonAction[3]) {
      return (send(res, 200, { url: 'http://localhost:5173/fiche-demo.pdf' }), true);
    }
  }
  if (method === 'GET' && path === '/me/certificates') {
    send(
      res,
      200,
      certificates
        .filter((cert) => cert.userId === user)
        .map(({ userId: _u, courseSlug: _c, ...view }) => view),
    );
    return true;
  }
  const download = /^\/me\/certificates\/([\w-]+)\/download$/.exec(path);
  if (method === 'GET' && download)
    return (send(res, 200, { url: 'http://localhost:5173/certificat-demo.pdf' }), true);
  if (method === 'GET' && path === '/me/perks') {
    const owned = packs.filter((pack) => pack.rank <= rankOf(user));
    const included = owned.reduce((max, pack) => Math.max(max, pack.callsIncluded), 0);
    const used = (callRequests.get(user) ?? []).filter(
      (entry) => entry.status !== 'cancelled',
    ).length;
    send(res, 200, {
      callsIncluded: included,
      callsUsed: used,
      callsRemaining: Math.max(0, included - used),
      features: rankOf(user) >= 2 ? ['2 fournisseurs offerts'] : [],
    } satisfies S['PerksDto']);
    return true;
  }
  if (path === '/me/call-requests') {
    const list = callRequests.get(user) ?? [];
    if (method === 'GET') return (send(res, 200, list), true);
    if (method === 'POST') {
      const included = packs
        .filter((pack) => pack.rank <= rankOf(user))
        .reduce((max, pack) => Math.max(max, pack.callsIncluded), 0);
      if (list.length >= included)
        return (
          fail(
            res,
            409,
            'NO_CALLS_LEFT',
            'Vous avez utilisé tous les appels inclus dans vos packs.',
          ),
          true
        );
      const request: S['CallRequestDto'] = {
        id: `call-${list.length + 1}`,
        status: 'requested',
        message: String(body.message ?? ''),
        scheduledAt: null,
        createdAt: new Date().toISOString(),
      };
      callRequests.set(user, [...list, request]);
      return (send(res, 201, request), true);
    }
  }
  return false;
}
