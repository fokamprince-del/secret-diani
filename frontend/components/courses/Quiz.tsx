'use client';

import { useRef, useState } from 'react';
import { authedApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import type { QuizResult, QuizView } from '@/lib/api/types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { FormStatus } from '../ui/States';
import styles from './Quiz.module.css';

/**
 * Quiz de fin de leçon, utilisable au pouce : grandes zones de réponse, correction par l'API
 * (les bonnes réponses ne sont connues qu'après validation), retour explicite « juste / faux »
 * en mots et en icônes, explication, nouvel essai si permis.
 */
export function Quiz({
  lessonId,
  quiz,
  onCompleted,
}: {
  lessonId: string;
  quiz: QuizView;
  onCompleted: (lessonCompleted: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const choose = (questionId: string, choiceId: string, multiple: boolean, checked: boolean) => {
    setAnswers((current) => {
      const previous = current[questionId] ?? [];
      const next = multiple
        ? checked
          ? [...previous, choiceId]
          : previous.filter((id) => id !== choiceId)
        : [choiceId];
      return { ...current, [questionId]: next };
    });
  };

  const unanswered = quiz.questions.filter((question) => !(answers[question.id]?.length ?? 0));

  const submit = async () => {
    if (unanswered.length > 0) {
      setFailure(
        unanswered.length === 1
          ? 'Répondez à toutes les questions : il en reste une.'
          : `Répondez à toutes les questions : il en reste ${unanswered.length}.`,
      );
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const graded = unwrap(
        await authedApi.POST('/api/v1/me/lessons/{id}/quiz', {
          params: { path: { id: lessonId } },
          body: {
            answers: quiz.questions.map((question) => ({
              questionId: question.id,
              choiceIds: answers[question.id] ?? [],
            })),
          },
        }),
      );
      setResult(graded);
      onCompleted(graded.lessonCompleted);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      setFailure(userMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswers({});
  };

  const graded = (questionId: string) =>
    result?.questions.find((entry) => entry.questionId === questionId);
  const canRetry =
    result && !result.passed && (result.attemptsRemaining === null || result.attemptsRemaining > 0);

  return (
    <section aria-labelledby="quiz-titre" className={styles.quiz}>
      <div className={styles.entete}>
        <h2 id="quiz-titre">Quiz</h2>
        <p className={styles.aide}>
          {quiz.passScorePercent} % de bonnes réponses pour valider la leçon.
          {quiz.passed && ' Déjà réussi : vous pouvez le refaire pour réviser.'}
        </p>
      </div>

      <ol className={styles.questions}>
        {quiz.questions.map((question, index) => {
          const correction = graded(question.id);
          return (
            <li key={question.id} className={styles.question}>
              <fieldset className={styles.groupe} disabled={result !== null}>
                <legend className={styles.enonce}>
                  <span className="visually-hidden">Question {index + 1} : </span>
                  {question.prompt}
                  {question.multiple && (
                    <span className={styles.multiple}> (plusieurs réponses possibles)</span>
                  )}
                </legend>
                <div className={styles.choix}>
                  {question.choices.map((choice) => {
                    const selected = answers[question.id]?.includes(choice.id) ?? false;
                    const right = correction?.correctChoiceIds.includes(choice.id) ?? false;
                    return (
                      <label
                        key={choice.id}
                        className={styles.reponse}
                        data-etat={
                          correction ? (right ? 'juste' : selected ? 'faux' : undefined) : undefined
                        }
                      >
                        <input
                          type={question.multiple ? 'checkbox' : 'radio'}
                          name={question.id}
                          checked={selected}
                          onChange={(event) =>
                            choose(question.id, choice.id, question.multiple, event.target.checked)
                          }
                        />
                        <span>{choice.label}</span>
                        {correction && right && (
                          <span className={styles.marque}>
                            <Icon name="check" size={18} /> Bonne réponse
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {correction && (
                <p className={styles.correction} data-juste={correction.correct || undefined}>
                  <Icon name={correction.correct ? 'check' : 'close'} size={18} />
                  <span>
                    <strong>{correction.correct ? 'Juste.' : 'Pas tout à fait.'}</strong>{' '}
                    {correction.explanation}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <FormStatus tone="erreur">{failure}</FormStatus>
      {result ? (
        <div ref={resultRef} tabIndex={-1} className={styles.resultat}>
          <FormStatus tone="succes">
            Score : {result.scorePercent} %.{' '}
            {result.passed
              ? 'Quiz réussi, bravo !'
              : 'Pas encore validé : relisez les explications et réessayez.'}
            {result.lessonCompleted && ' Leçon terminée.'}
          </FormStatus>
          {canRetry && (
            <Button variant="secondaire" onClick={retry}>
              Recommencer le quiz
            </Button>
          )}
        </div>
      ) : (
        <div>
          <Button onClick={submit} loading={busy}>
            Valider mes réponses
          </Button>
        </div>
      )}
    </section>
  );
}
