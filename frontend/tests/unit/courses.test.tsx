import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Quiz } from '@/components/courses/Quiz';
import { shouldSave } from '@/components/courses/VideoPlayer';
import { authedApi } from '@/lib/api/authed';
import type { QuizView } from '@/lib/api/types';
import { formatDuration } from '@/lib/format';
import { axeViolations } from './axe';

const quiz: QuizView = {
  id: 'quiz',
  passScorePercent: 66,
  maxAttempts: null,
  attemptsUsed: 0,
  bestScore: null,
  passed: false,
  questions: [
    {
      id: 'q1',
      prompt: 'Température du beurre ?',
      multiple: false,
      choices: [
        { id: 'a', label: 'Froid' },
        { id: 'b', label: 'Pommade' },
      ],
    },
    {
      id: 'q2',
      prompt: 'Sucres adaptés ?',
      multiple: true,
      choices: [
        { id: 'c', label: 'Glace' },
        { id: 'd', label: 'Morceaux' },
      ],
    },
  ],
};

describe('enregistrement de la progression vidéo', () => {
  it('au plus toutes les 15 s de lecture, toujours à la pause', () => {
    expect(shouldSave(10, 0, false)).toBe(false);
    expect(shouldSave(15, 0, false)).toBe(true);
    expect(shouldSave(16, 15, true)).toBe(true);
    expect(shouldSave(15, 15, true)).toBe(false);
    // Retour en arrière important : la nouvelle position est enregistrée.
    expect(shouldSave(10, 60, false)).toBe(true);
  });

  it('durées lisibles', () => {
    expect(formatDuration(13)).toBe('13 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(80)).toBe('1 h 20 min');
  });
});

describe('Quiz', () => {
  it('exige une réponse à chaque question avant d’appeler l’API', async () => {
    const post = vi.spyOn(authedApi, 'POST');
    render(<Quiz lessonId="l1" quiz={quiz} onCompleted={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Valider mes réponses' }));
    expect(screen.getByRole('alert')).toHaveTextContent('il en reste 2');
    expect(post).not.toHaveBeenCalled();
  });

  it('envoie les réponses, affiche la correction en mots et propose de recommencer', async () => {
    const onCompleted = vi.fn();
    const post = vi.spyOn(authedApi, 'POST').mockResolvedValue({
      data: {
        scorePercent: 50,
        passed: false,
        attemptsRemaining: null,
        lessonCompleted: false,
        questions: [
          {
            questionId: 'q1',
            correct: true,
            correctChoiceIds: ['b'],
            explanation: 'Le beurre pommade.',
          },
          {
            questionId: 'q2',
            correct: false,
            correctChoiceIds: ['c'],
            explanation: 'Le sucre glace se dissout.',
          },
        ],
      },
      response: new Response('{}', { status: 200 }),
    } as never);
    const { container } = render(<Quiz lessonId="l1" quiz={quiz} onCompleted={onCompleted} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Pommade' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Morceaux' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider mes réponses' }));

    expect(post).toHaveBeenCalledWith('/api/v1/me/lessons/{id}/quiz', {
      params: { path: { id: 'l1' } },
      body: {
        answers: [
          { questionId: 'q1', choiceIds: ['b'] },
          { questionId: 'q2', choiceIds: ['d'] },
        ],
      },
    });
    expect(await screen.findByText(/Score : 50 %/)).toBeInTheDocument();
    expect(screen.getByText('Juste.')).toBeInTheDocument();
    expect(screen.getByText('Pas tout à fait.')).toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledWith(false);
    expect(await axeViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Recommencer le quiz' }));
    expect(screen.getByRole('radio', { name: 'Pommade' })).not.toBeChecked();
  });
});
