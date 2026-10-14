'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { authedApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import { ApiError, userMessage } from '@/lib/api/errors';
import type { MyCourse } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { TextAreaField } from '../forms/Field';
import { Button, ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { EmptyState, ErrorState, FormStatus, Skeleton } from '../ui/States';
import { MemberSection } from './Section';
import formStyles from './Forms.module.css';
import styles from './MyCourses.module.css';

const keys = {
  courses: ['me', 'courses'] as const,
  certificates: ['me', 'certificates'] as const,
  perks: ['me', 'perks'] as const,
  calls: ['me', 'call-requests'] as const,
};

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.progression}>
      <div
        className={styles.barre}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${value}%` }} />
      </div>
      <span className={styles.pourcentage}>{value} %</span>
    </div>
  );
}

function CourseItem({ course }: { course: MyCourse }) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const finished = course.progressPercent >= 100;

  const claim = async () => {
    setBusy(true);
    setFailure(null);
    try {
      unwrap(
        await authedApi.POST('/api/v1/me/courses/{slug}/certificate', {
          params: { path: { slug: course.slug } },
        }),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.courses }),
        queryClient.invalidateQueries({ queryKey: keys.certificates }),
      ]);
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.status === 400
          ? `${error.message} Complétez votre prénom et votre nom dans « Mon profil » : ils figurent sur le certificat.`
          : userMessage(error),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.formation}>
      <div className={styles.entete}>
        <h3 className={styles.titre}>
          <Link href={`/formations/${course.slug}`}>{course.title}</Link>
        </h3>
        {course.certificateNumber && (
          <span className={styles.obtenu}>
            <Icon name="check" size={16} /> Certificat obtenu
          </span>
        )}
      </div>
      <Progress value={course.progressPercent} label={`Progression dans ${course.title}`} />
      <div className={formStyles.actions}>
        {course.resume && (
          <ButtonLink href={`/formations/${course.slug}/${course.resume.slug}`} withArrow>
            {course.progressPercent === 0 ? 'Commencer' : 'Reprendre'}
            <span className="visually-hidden"> : {course.resume.title}</span>
          </ButtonLink>
        )}
        {finished && !course.certificateNumber && (
          <Button onClick={claim} loading={busy}>
            Obtenir mon certificat
          </Button>
        )}
      </div>
      <FormStatus tone="erreur">{failure}</FormStatus>
    </li>
  );
}

function CourseList() {
  const courses = useQuery({
    queryKey: keys.courses,
    queryFn: async () => unwrap(await authedApi.GET('/api/v1/me/courses')),
  });
  if (courses.isError) {
    return (
      <ErrorState
        title="Vos formations n’ont pas pu être chargées"
        headingLevel={3}
        action={<Button onClick={() => courses.refetch()}>Réessayer</Button>}
      >
        <p>{userMessage(courses.error)}</p>
      </ErrorState>
    );
  }
  if (!courses.data) return <Skeleton height="10rem" radius="14px" />;
  if (courses.data.length === 0) {
    return (
      <EmptyState
        title="Aucune formation pour le moment"
        icon="play"
        headingLevel={3}
        action={<ButtonLink href="/formations">Découvrir les packs</ButtonLink>}
      >
        <p>Après l’achat d’un pack, vos formations apparaissent ici dès le paiement confirmé.</p>
      </EmptyState>
    );
  }
  return (
    <ul role="list" className={styles.liste}>
      {courses.data.map((course) => (
        <CourseItem key={course.slug} course={course} />
      ))}
    </ul>
  );
}

function Certificates() {
  const certificates = useQuery({
    queryKey: keys.certificates,
    queryFn: async () => unwrap(await authedApi.GET('/api/v1/me/certificates')),
  });
  const [failure, setFailure] = useState<string | null>(null);

  const download = async (id: string) => {
    setFailure(null);
    try {
      const { url } = unwrap(
        await authedApi.GET('/api/v1/me/certificates/{id}/download', { params: { path: { id } } }),
      );
      window.location.assign(url);
    } catch (error) {
      setFailure(userMessage(error));
    }
  };

  if (!certificates.data || certificates.data.length === 0) return null;
  return (
    <MemberSection id="certificats-titre" title="Mes certificats">
      <ul role="list" className={formStyles.liste}>
        {certificates.data.map((certificate) => (
          <li key={certificate.id} className={formStyles.element}>
            <div>
              <p className={formStyles.elementTitre}>{certificate.courseTitle}</p>
              <p className={formStyles.elementDetail}>
                N° {certificate.number}, délivré le {formatDate(certificate.issuedAt)} ·{' '}
                <a href={certificate.verificationUrl}>Page de vérification</a>
              </p>
            </div>
            {certificate.pdfAvailable && (
              <Button variant="secondaire" onClick={() => download(certificate.id)}>
                <Icon name="download" size={20} />
                Télécharger
                <span className="visually-hidden"> le certificat {certificate.courseTitle}</span>
              </Button>
            )}
          </li>
        ))}
      </ul>
      <FormStatus tone="erreur">{failure}</FormStatus>
    </MemberSection>
  );
}

const CALL_STATUS: Record<string, string> = {
  requested: 'Demande envoyée',
  scheduled: 'Rendez-vous fixé',
  done: 'Appel effectué',
  cancelled: 'Annulé',
};

function Perks() {
  const queryClient = useQueryClient();
  const perks = useQuery({
    queryKey: keys.perks,
    queryFn: async () => unwrap(await authedApi.GET('/api/v1/me/perks')),
  });
  const calls = useQuery({
    queryKey: keys.calls,
    queryFn: async () => unwrap(await authedApi.GET('/api/v1/me/call-requests')),
  });
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ tone: 'succes' | 'erreur'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!perks.data || (perks.data.callsIncluded === 0 && perks.data.features.length === 0))
    return null;

  const request = async () => {
    if (message.trim().length < 10) {
      setStatus({
        tone: 'erreur',
        text: 'Indiquez le sujet de l’appel et vos disponibilités (10 caractères au moins).',
      });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      unwrap(
        await authedApi.POST('/api/v1/me/call-requests', { body: { message: message.trim() } }),
      );
      setMessage('');
      setStatus({
        tone: 'succes',
        text: 'Demande envoyée : Diani vous propose un créneau par e-mail.',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.perks }),
        queryClient.invalidateQueries({ queryKey: keys.calls }),
      ]);
    } catch (error) {
      setStatus({ tone: 'erreur', text: userMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <MemberSection id="avantages-titre" title="Mes avantages">
      {perks.data.features.length > 0 && (
        <ul className={styles.avantages}>
          {perks.data.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      )}
      {perks.data.callsIncluded > 0 && (
        <div className={formStyles.formulaire}>
          <p>
            Appels personnalisés : <strong>{perks.data.callsRemaining}</strong> restant
            {perks.data.callsRemaining > 1 ? 's' : ''} sur {perks.data.callsIncluded}.
          </p>
          {(calls.data ?? []).length > 0 && (
            <ul role="list" className={formStyles.liste}>
              {(calls.data ?? []).map((call) => (
                <li key={call.id} className={formStyles.element}>
                  <div>
                    <p className={formStyles.elementTitre}>
                      {CALL_STATUS[call.status] ?? call.status}
                    </p>
                    <p className={formStyles.elementDetail}>
                      Demandé le {formatDate(call.createdAt)}
                      {call.scheduledAt && ` · rendez-vous le ${formatDate(call.scheduledAt)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {perks.data.callsRemaining > 0 && (
            <>
              <TextAreaField
                label="Demander un appel"
                hint="Le sujet et vos disponibilités."
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <div>
                <Button variant="secondaire" onClick={request} loading={busy}>
                  Envoyer ma demande d’appel
                </Button>
              </div>
            </>
          )}
          <FormStatus tone="succes">{status?.tone === 'succes' ? status.text : null}</FormStatus>
          <FormStatus tone="erreur">{status?.tone === 'erreur' ? status.text : null}</FormStatus>
        </div>
      )}
    </MemberSection>
  );
}

export function MyCourses() {
  return (
    <>
      <MemberSection id="formations-titre" title="Mes formations">
        <CourseList />
      </MemberSection>
      <Certificates />
      <Perks />
    </>
  );
}
