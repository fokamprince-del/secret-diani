import { createHash } from 'node:crypto';
import {
  CERTIFICATE_NUMBER_PATTERN,
  certificateNumber,
  gradeQuiz,
  grantsAccess,
  isActiveAccess,
  lessonCompleted,
  percent,
  resumeLesson,
  signBunnyHlsUrl,
} from './courses-domain';

describe('accès aux formations', () => {
  it('un pack supérieur inclut les contenus des packs précédents', () => {
    expect(grantsAccess([3], 1)).toBe(true);
    expect(grantsAccess([3], 2)).toBe(true);
    expect(grantsAccess([2], 3)).toBe(false);
    expect(grantsAccess([1, 2], 2)).toBe(true);
    expect(grantsAccess([], 1)).toBe(false);
  });

  it('un accès révoqué ou expiré ne compte plus', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    expect(isActiveAccess({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isActiveAccess({ revokedAt: now, expiresAt: null }, now)).toBe(false);
    expect(
      isActiveAccess({ revokedAt: null, expiresAt: new Date('2026-10-13T11:59:59Z') }, now),
    ).toBe(false);
    expect(
      isActiveAccess({ revokedAt: null, expiresAt: new Date('2026-12-31T00:00:00Z') }, now),
    ).toBe(true);
  });
});

describe('correction des quiz (côté serveur)', () => {
  const questions = [
    {
      id: 'q1',
      explanation: 'Beurre mou, pas fondu.',
      choices: [
        { id: 'a', isCorrect: true },
        { id: 'b', isCorrect: false },
      ],
    },
    {
      id: 'q2',
      explanation: null,
      choices: [
        { id: 'c', isCorrect: true },
        { id: 'd', isCorrect: true },
        { id: 'e', isCorrect: false },
      ],
    },
    {
      id: 'q3',
      explanation: null,
      choices: [
        { id: 'f', isCorrect: false },
        { id: 'g', isCorrect: true },
      ],
    },
  ];

  it('exige exactement les bonnes réponses (ni une de moins, ni une de trop)', () => {
    const result = gradeQuiz(
      questions,
      [
        { questionId: 'q1', choiceIds: ['a'] },
        { questionId: 'q2', choiceIds: ['c'] },
        { questionId: 'q3', choiceIds: ['f', 'g'] },
      ],
      70,
    );
    expect(result.questions.map((question) => question.correct)).toEqual([true, false, false]);
    expect(result).toMatchObject({ scorePercent: 33, passed: false });
    expect(result.questions[1]!.correctChoiceIds).toEqual(['c', 'd']);
  });

  it('valide au-dessus du seuil ; une question sans réponse est fausse', () => {
    const result = gradeQuiz(
      questions,
      [
        { questionId: 'q1', choiceIds: ['a'] },
        { questionId: 'q2', choiceIds: ['d', 'c'] },
      ],
      66,
    );
    expect(result).toMatchObject({ scorePercent: 67, passed: true });
    expect(result.questions[2]).toMatchObject({ correct: false, correctChoiceIds: ['g'] });
  });
});

describe('progression', () => {
  it('pourcentages et leçon à reprendre', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
    const lessons = [
      { id: 1, completed: true },
      { id: 2, completed: false },
      { id: 3, completed: false },
    ];
    expect(resumeLesson(lessons)?.id).toBe(2);
    expect(resumeLesson([{ id: 1, completed: true }])?.id).toBe(1);
    expect(resumeLesson([])).toBeNull();
  });

  it('une leçon est terminée quand la vidéo est vue et le quiz réussi', () => {
    const now = new Date();
    expect(
      lessonCompleted({ hasVideo: true, hasQuiz: true, videoCompletedAt: now, quizPassedAt: null }),
    ).toBe(false);
    expect(
      lessonCompleted({ hasVideo: true, hasQuiz: true, videoCompletedAt: now, quizPassedAt: now }),
    ).toBe(true);
    expect(
      lessonCompleted({
        hasVideo: false,
        hasQuiz: false,
        videoCompletedAt: null,
        quizPassedAt: null,
      }),
    ).toBe(true);
  });
});

describe('certificats', () => {
  it('numéro aléatoire, lisible, au format attendu', () => {
    const numbers = new Set(Array.from({ length: 200 }, () => certificateNumber(2026)));
    expect(numbers.size).toBe(200);
    for (const number of numbers) {
      expect(number).toMatch(CERTIFICATE_NUMBER_PATTERN);
      expect(number.slice(11)).not.toMatch(/[01IO]/);
    }
  });
});

describe('URL de lecture Bunny Stream', () => {
  it('jeton de répertoire SHA-256 couvrant la playlist et ses segments', () => {
    const expiresAt = new Date('2026-10-13T12:00:00Z');
    const url = signBunnyHlsUrl({
      host: 'vz-abc.b-cdn.net',
      securityKey: 'cle',
      videoId: 'v-123',
      expiresAt,
    });
    const expires = Math.floor(expiresAt.getTime() / 1000);
    const expected = createHash('sha256')
      .update(`cle/v-123/${expires}token_path=/v-123/`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(url).toBe(
      `https://vz-abc.b-cdn.net/bcdn_token=${expected}&expires=${expires}&token_path=%2Fv-123%2F/v-123/playlist.m3u8`,
    );
  });

  it('le jeton change avec l’expiration et l’IP liée', () => {
    const base = { host: 'h', securityKey: 'k', videoId: 'v', expiresAt: new Date(1_000_000) };
    expect(signBunnyHlsUrl(base)).not.toBe(
      signBunnyHlsUrl({ ...base, expiresAt: new Date(2_000_000) }),
    );
    expect(signBunnyHlsUrl(base)).not.toBe(signBunnyHlsUrl({ ...base, userIp: '203.0.113.7' }));
  });
});
