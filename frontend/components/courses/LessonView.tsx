'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { authedApi, optionalAuthApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import { ApiError, userMessage } from '@/lib/api/errors';
import type { Lesson } from '@/lib/api/types';
import { useAuth } from '../auth/AuthProvider';
import { RichText } from '../content/RichText';
import { Button, ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { ErrorState, FormStatus, Skeleton } from '../ui/States';
import { Quiz } from './Quiz';
import { VideoPlayer } from './VideoPlayer';
import styles from './LessonView.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; lesson: Lesson }
  | { kind: 'locked'; message: string }
  | { kind: 'error'; message: string };

const sizeFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const fileSize = (bytes: number) =>
  bytes >= 1_000_000
    ? `${sizeFormatter.format(bytes / 1_000_000)} Mo`
    : `${Math.ceil(bytes / 1000)} ko`;

/**
 * Leçon : vidéo visible dès le premier écran sur mobile, reprise de lecture, fiche PDF (URL
 * signée), conseils, quiz, navigation précédente / suivante. Accès refusé → invitation claire
 * à choisir le pack. La leçon d'exemple se regarde sans compte (rien n'est alors enregistré).
 */
export function LessonView({ courseSlug, lessonSlug }: { courseSlug: string; lessonSlug: string }) {
  const { status } = useAuth();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [completed, setCompleted] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;
    optionalAuthApi
      .GET('/api/v1/courses/{slug}/lessons/{lessonSlug}', {
        params: { path: { slug: courseSlug, lessonSlug } },
      })
      .then(unwrap)
      .then(
        (lesson) => {
          if (cancelled) return;
          setState({ kind: 'ready', lesson });
          setCompleted(lesson.progress?.completed ?? false);
        },
        (error: unknown) => {
          if (cancelled) return;
          if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
            setState({ kind: 'locked', message: error.message });
          } else {
            setState({ kind: 'error', message: userMessage(error) });
          }
        },
      );
    return () => {
      cancelled = true;
    };
  }, [courseSlug, lessonSlug, status]);

  const lesson = state.kind === 'ready' ? state.lesson : null;
  const tracked = lesson?.progress !== null && lesson?.progress !== undefined;

  const saveProgress = useCallback(
    (positionSeconds: number, videoCompleted: boolean) => {
      if (!lesson) return;
      authedApi
        .PUT('/api/v1/me/lessons/{id}/progress', {
          params: { path: { id: lesson.id } },
          body: { positionSeconds, videoCompleted },
        })
        .then(unwrap)
        .then(
          (result) => {
            if (result.completed) setCompleted(true);
          },
          () => {
            // Enregistrement de la position : un échec ponctuel n'interrompt pas la lecture.
          },
        );
    },
    [lesson],
  );

  const download = async (resourceId: string) => {
    if (!lesson) return;
    setDownloading(resourceId);
    setDownloadError(null);
    try {
      const { url } = unwrap(
        await authedApi.GET('/api/v1/me/lessons/{id}/resources/{resourceId}', {
          params: { path: { id: lesson.id, resourceId } },
        }),
      );
      window.location.assign(url);
    } catch (error) {
      setDownloadError(
        error instanceof ApiError && error.status === 409
          ? 'Votre fiche personnalisée est en préparation : réessayez dans quelques secondes.'
          : userMessage(error),
      );
    } finally {
      setDownloading(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div className={`conteneur ${styles.chargement}`} aria-busy="true">
        <p className="visually-hidden" role="status">
          Chargement de la leçon…
        </p>
        <Skeleton height="60svh" radius="14px" />
        <Skeleton width="60%" height="2rem" />
      </div>
    );
  }
  if (state.kind === 'locked') {
    return (
      <div className="conteneur">
        <div className={styles.verrou}>
          <Icon name="lock" size={32} className={styles.verrouIcone} />
          <h1>Cette leçon fait partie d’une formation</h1>
          <p>{state.message}</p>
          <p>
            Choisissez le pack qui la contient pour accéder à toute la formation : vidéos, fiches,
            quiz et certificat.
          </p>
          <div className={styles.actions}>
            <ButtonLink href={`/formations/${courseSlug}`} withArrow>
              Voir la formation et son pack
            </ButtonLink>
            {status !== 'authenticated' && (
              <ButtonLink
                href={`/connexion?retour=${encodeURIComponent(`/formations/${courseSlug}/${lessonSlug}`)}`}
                variant="secondaire"
              >
                J’ai déjà un compte
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (state.kind === 'error' || !lesson) {
    return (
      <div className="conteneur">
        <ErrorState
          title="Cette leçon n’a pas pu être chargée"
          headingLevel={1}
          action={<Button onClick={() => window.location.reload()}>Réessayer</Button>}
        >
          <p>{state.kind === 'error' ? state.message : ''}</p>
        </ErrorState>
      </div>
    );
  }

  const lessonHref = (slug: string) => `/formations/${courseSlug}/${slug}`;

  return (
    <article className={`conteneur ${styles.lecon}`}>
      <div className={styles.lecteur}>
        <VideoPlayer
          title={lesson.title}
          video={lesson.video}
          startAt={lesson.progress?.positionSeconds ?? 0}
          onProgress={tracked ? saveProgress : undefined}
        />
      </div>

      <div className={styles.texte}>
        <p className={styles.fil}>
          <Link href={`/formations/${courseSlug}`}>{lesson.course.title}</Link> ·{' '}
          {lesson.moduleTitle}
        </p>
        <h1 className={styles.titre}>{lesson.title}</h1>
        {lesson.summary && <p>{lesson.summary}</p>}
        <p className={styles.statut} role="status">
          {tracked ? (
            completed ? (
              <>
                <Icon name="check" size={18} /> Leçon terminée
              </>
            ) : (
              'Votre progression est enregistrée automatiquement.'
            )
          ) : (
            'Leçon offerte : créez un compte et choisissez un pack pour suivre toute la formation.'
          )}
        </p>

        <nav aria-label="Leçons" className={styles.navigation}>
          {lesson.previous ? (
            <Link
              href={lessonHref(lesson.previous.slug)}
              className={`${styles.voisine} sans-filet`}
            >
              <span className={styles.sens}>Leçon précédente</span>
              {lesson.previous.title}
            </Link>
          ) : (
            <span />
          )}
          {lesson.next && (
            <Link
              href={lessonHref(lesson.next.slug)}
              className={`${styles.voisine} ${styles.suivante} sans-filet`}
            >
              <span className={styles.sens}>Leçon suivante</span>
              {lesson.next.title}
            </Link>
          )}
        </nav>

        {lesson.resources.length > 0 && (
          <section aria-labelledby="fiches-titre" className={styles.bloc}>
            <h2 id="fiches-titre">Fiches à télécharger</h2>
            <ul role="list" className={styles.fiches}>
              {lesson.resources.map((resource) => (
                <li key={resource.id}>
                  {tracked ? (
                    <Button
                      variant="secondaire"
                      onClick={() => download(resource.id)}
                      loading={downloading === resource.id}
                    >
                      <Icon name="download" size={20} />
                      {resource.title}
                      {resource.sizeBytes !== null && (
                        <span className={styles.taille}> ({fileSize(resource.sizeBytes)})</span>
                      )}
                    </Button>
                  ) : (
                    <p>{resource.title} : disponible avec le pack.</p>
                  )}
                </li>
              ))}
            </ul>
            <FormStatus tone="erreur">{downloadError}</FormStatus>
          </section>
        )}

        {lesson.tipsHtml && (
          <section aria-labelledby="conseils-titre" className={styles.bloc}>
            <h2 id="conseils-titre">Conseils & astuces</h2>
            <RichText html={lesson.tipsHtml} />
          </section>
        )}

        {lesson.quiz && tracked && (
          <Quiz
            lessonId={lesson.id}
            quiz={lesson.quiz}
            onCompleted={(done) => done && setCompleted(true)}
          />
        )}

        {tracked && (
          <p className={styles.retour}>
            <Link href="/espace-membre/formations">Revenir à mes formations</Link>
          </p>
        )}
      </div>
    </article>
  );
}
