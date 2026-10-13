import { createHash, randomInt } from 'node:crypto';

// --- Accès ------------------------------------------------------------------------------------

/**
 * Un pack inclut tous les packs de rang inférieur ou égal (Premium ⊇ Intermédiaire ⊇ Essentiel) :
 * une formation du pack de rang r est accessible à qui possède un pack de rang ≥ r.
 */
export function grantsAccess(ownedRanks: number[], requiredRank: number): boolean {
  return ownedRanks.some((rank) => rank >= requiredRank);
}

/** Accès actif : ni révoqué, ni expiré. */
export function isActiveAccess(
  access: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): boolean {
  return access.revokedAt === null && (access.expiresAt === null || access.expiresAt > now);
}

// --- Quiz -------------------------------------------------------------------------------------

export interface QuizKeyQuestion {
  id: string;
  explanation: string | null;
  choices: { id: string; isCorrect: boolean }[];
}

export interface QuizAnswer {
  questionId: string;
  choiceIds: string[];
}

export interface GradedQuestion {
  questionId: string;
  correct: boolean;
  correctChoiceIds: string[];
  explanation: string | null;
}

/**
 * Correction côté serveur : une question est juste si l'ensemble des choix cochés est exactement
 * l'ensemble des bonnes réponses (une question sans réponse est fausse). Score arrondi à l'entier.
 */
export function gradeQuiz(
  questions: QuizKeyQuestion[],
  answers: QuizAnswer[],
  passScorePercent: number,
): { scorePercent: number; passed: boolean; questions: GradedQuestion[] } {
  const byQuestion = new Map(
    answers.map((answer) => [answer.questionId, new Set(answer.choiceIds)]),
  );
  const graded = questions.map((question) => {
    const expected = question.choices
      .filter((choice) => choice.isCorrect)
      .map((choice) => choice.id);
    const given = byQuestion.get(question.id) ?? new Set<string>();
    const correct = given.size === expected.length && expected.every((id) => given.has(id));
    return {
      questionId: question.id,
      correct,
      correctChoiceIds: expected,
      explanation: question.explanation,
    };
  });
  const scorePercent =
    questions.length === 0
      ? 100
      : Math.round((graded.filter((question) => question.correct).length / questions.length) * 100);
  return { scorePercent, passed: scorePercent >= passScorePercent, questions: graded };
}

// --- Progression ------------------------------------------------------------------------------

export function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Leçon terminée : vidéo vue (ou leçon sans vidéo) et quiz réussi s'il y en a un. */
export function lessonCompleted(state: {
  hasVideo: boolean;
  hasQuiz: boolean;
  videoCompletedAt: Date | null;
  quizPassedAt: Date | null;
}): boolean {
  return (
    (!state.hasVideo || state.videoCompletedAt !== null) &&
    (!state.hasQuiz || state.quizPassedAt !== null)
  );
}

/** « Reprendre » : première leçon non terminée dans l'ordre du parcours (ou la dernière). */
export function resumeLesson<T extends { completed: boolean }>(lessons: T[]): T | null {
  return lessons.find((lesson) => !lesson.completed) ?? lessons.at(-1) ?? null;
}

// --- Certificats ------------------------------------------------------------------------------

/** Alphabet sans caractères ambigus (0/O, 1/I) pour un numéro lisible et dicté sans erreur. */
const CERTIFICATE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** « DIANI-2026-7K3QF9XA » : 8 caractères aléatoires (40 bits), non énumérables. */
export function certificateNumber(year: number): string {
  let suffix = '';
  for (let i = 0; i < 8; i += 1)
    suffix += CERTIFICATE_ALPHABET[randomInt(CERTIFICATE_ALPHABET.length)];
  return `DIANI-${year}-${suffix}`;
}

export const CERTIFICATE_NUMBER_PATTERN = /^DIANI-\d{4}-[0-9A-Z]{8}$/;

// --- Vidéo Bunny Stream -----------------------------------------------------------------------

/**
 * URL de lecture HLS signée par jeton de répertoire Bunny CDN (authentification par jeton
 * « avancée », SHA-256) : le jeton couvre `/{videoId}/`, donc la playlist et tous ses segments,
 * jusqu'à l'expiration. Algorithme de la documentation Bunny (fonction `sign_bcdn_url`).
 */
export function signBunnyHlsUrl(options: {
  host: string;
  securityKey: string;
  videoId: string;
  expiresAt: Date;
  userIp?: string;
}): string {
  const expires = Math.floor(options.expiresAt.getTime() / 1000);
  const tokenPath = `/${options.videoId}/`;
  const parameterData = `token_path=${tokenPath}`;
  const hashable = `${options.securityKey}${tokenPath}${expires}${options.userIp ?? ''}${parameterData}`;
  const token = createHash('sha256')
    .update(hashable)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `https://${options.host}/bcdn_token=${token}&expires=${expires}&token_path=${encodeURIComponent(tokenPath)}/${options.videoId}/playlist.m3u8`;
}
