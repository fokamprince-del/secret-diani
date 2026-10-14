'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { authedApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import { fieldMessages, userMessage } from '@/lib/api/errors';
import { dropSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { type ChangePasswordValues, changePasswordSchema, PASSWORD_MIN_LENGTH } from '@/lib/forms';
import { PasswordField } from '../forms/PasswordField';
import { Button } from '../ui/Button';
import { ErrorState, FormStatus, Skeleton } from '../ui/States';
import { type ActiveSession, queryKeys, useSessions } from './queries';
import { MemberSection } from './Section';
import styles from './Forms.module.css';

function ChangePasswordForm() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<{ tone: 'succes' | 'erreur'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirmation: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, password }) => {
    setStatus(null);
    try {
      const result = unwrap(
        await authedApi.POST('/api/v1/auth/password/change', {
          body: { currentPassword, newPassword: password },
        }),
      );
      reset();
      setStatus({ tone: 'succes', text: result.message });
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    } catch (error) {
      const byField = fieldMessages(error);
      if (byField.currentPassword)
        setError('currentPassword', { message: byField.currentPassword });
      if (byField.newPassword) setError('password', { message: byField.newPassword });
      setStatus({ tone: 'erreur', text: userMessage(error) });
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className={styles.formulaire}>
      <PasswordField
        label="Mot de passe actuel"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <PasswordField
        label="Nouveau mot de passe"
        autoComplete="new-password"
        hint={`${PASSWORD_MIN_LENGTH} caractères au moins.`}
        error={errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Confirmez le nouveau mot de passe"
        autoComplete="new-password"
        error={errors.confirmation?.message}
        {...register('confirmation')}
      />
      <FormStatus tone="succes">{status?.tone === 'succes' ? status.text : null}</FormStatus>
      <FormStatus tone="erreur">{status?.tone === 'erreur' ? status.text : null}</FormStatus>
      <div>
        <Button type="submit" loading={isSubmitting}>
          Changer mon mot de passe
        </Button>
      </div>
    </form>
  );
}

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** « Chrome sur Android » plutôt que la chaîne brute du navigateur. */
export function deviceName(userAgent: string | null): string {
  if (!userAgent) return 'Appareil inconnu';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Navigateur';
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iPhone ou iPad'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  return system ? `${browser} sur ${system}` : browser;
}

function SessionsList() {
  const sessions = useSessions();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<{ tone: 'succes' | 'erreur'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const revoke = async (session: ActiveSession) => {
    setStatus(null);
    try {
      unwrap(
        await authedApi.DELETE('/api/v1/me/sessions/{id}', {
          params: { path: { id: session.id } },
        }),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      setStatus({ tone: 'succes', text: 'Appareil déconnecté.' });
    } catch (error) {
      setStatus({ tone: 'erreur', text: userMessage(error) });
    }
  };

  const logoutEverywhere = async () => {
    setBusy(true);
    try {
      unwrap(await authedApi.POST('/api/v1/auth/logout-all'));
      dropSession();
    } catch (error) {
      setStatus({ tone: 'erreur', text: userMessage(error) });
      setBusy(false);
    }
  };

  if (sessions.isError) {
    return (
      <ErrorState
        title="La liste des appareils n’a pas pu être chargée"
        headingLevel={3}
        action={<Button onClick={() => sessions.refetch()}>Réessayer</Button>}
      />
    );
  }
  if (!sessions.data) return <Skeleton height="8rem" radius="10px" />;

  return (
    <>
      <ul role="list" className={styles.liste}>
        {sessions.data.map((session) => (
          <li key={session.id} className={styles.element}>
            <div>
              <p className={styles.elementTitre}>
                {deviceName(session.userAgent)}
                {session.current && <span className={styles.pastille}>Cet appareil</span>}
              </p>
              <p className={styles.elementDetail}>
                Connecté le {formatDate(session.createdAt)} · dernière activité le{' '}
                {dateTime.format(new Date(session.lastUsedAt))}
              </p>
            </div>
            {!session.current && (
              <div>
                <Button variant="secondaire" onClick={() => revoke(session)}>
                  Déconnecter
                  <span className="visually-hidden"> {deviceName(session.userAgent)}</span>
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <FormStatus tone="succes">{status?.tone === 'succes' ? status.text : null}</FormStatus>
      <FormStatus tone="erreur">{status?.tone === 'erreur' ? status.text : null}</FormStatus>
      <div>
        <Button variant="secondaire" onClick={logoutEverywhere} loading={busy}>
          Me déconnecter de tous les appareils
        </Button>
      </div>
    </>
  );
}

export function SecurityPanel() {
  return (
    <>
      <MemberSection
        id="mot-de-passe-titre"
        title="Mot de passe"
        intro={<p>Par sécurité, vos autres appareils seront déconnectés.</p>}
      >
        <ChangePasswordForm />
      </MemberSection>
      <MemberSection
        id="appareils-titre"
        title="Appareils connectés"
        intro={
          <p>
            Un appareil que vous ne reconnaissez pas ? Déconnectez-le, puis changez votre mot de
            passe.
          </p>
        }
      >
        <SessionsList />
      </MemberSection>
    </>
  );
}
