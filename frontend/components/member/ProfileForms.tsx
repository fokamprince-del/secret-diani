'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authedApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import { fieldMessages, userMessage } from '@/lib/api/errors';
import { emailField, optionalPhoneField } from '@/lib/forms';
import { CheckboxField, TextField } from '../forms/Field';
import { PasswordField } from '../forms/PasswordField';
import { Button } from '../ui/Button';
import { ErrorState, FormStatus, Skeleton } from '../ui/States';
import { type Profile, queryKeys, useProfile } from './queries';
import { MemberSection } from './Section';
import styles from './Forms.module.css';

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Indiquez votre prénom.').max(100, 'Prénom trop long.'),
  lastName: z.string().trim().max(100, 'Nom trop long.'),
  phone: optionalPhoneField,
  marketingConsent: z.boolean(),
});
type ProfileValues = z.infer<typeof profileSchema>;

const emailChangeSchema = z.object({
  newEmail: emailField,
  currentPassword: z.string().min(1, 'Indiquez votre mot de passe actuel.'),
});
type EmailChangeValues = z.infer<typeof emailChangeSchema>;

function ProfileForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<{ tone: 'succes' | 'erreur'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: profile.phone ?? '',
      marketingConsent: profile.marketingConsent,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setStatus(null);
    try {
      const updated = unwrap(
        await authedApi.PATCH('/api/v1/me', {
          body: {
            firstName: values.firstName,
            lastName: values.lastName || null,
            phone: values.phone || null,
            marketingConsent: values.marketingConsent,
          },
        }),
      );
      queryClient.setQueryData(queryKeys.profile, updated);
      reset(values);
      setStatus({ tone: 'succes', text: 'Vos informations sont enregistrées.' });
    } catch (error) {
      const byField = fieldMessages(error);
      for (const field of ['firstName', 'lastName', 'phone'] as const) {
        if (byField[field]) setError(field, { message: byField[field] });
      }
      setStatus({ tone: 'erreur', text: userMessage(error) });
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className={styles.formulaire}>
      <div className={styles.grille}>
        <TextField
          label="Prénom"
          autoComplete="given-name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          label="Nom"
          autoComplete="family-name"
          optional
          error={errors.lastName?.message}
          {...register('lastName')}
        />
        <TextField
          label="Téléphone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          optional
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>
      <CheckboxField
        label="Je souhaite recevoir les nouvelles des Secrets de Diani par e-mail."
        {...register('marketingConsent')}
      />
      <FormStatus tone="succes">{status?.tone === 'succes' ? status.text : null}</FormStatus>
      <FormStatus tone="erreur">{status?.tone === 'erreur' ? status.text : null}</FormStatus>
      <div>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Enregistrer mes informations
        </Button>
      </div>
    </form>
  );
}

function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const [status, setStatus] = useState<{ tone: 'succes' | 'erreur'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmailChangeValues>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: { newEmail: '', currentPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setStatus(null);
    try {
      const result = unwrap(await authedApi.POST('/api/v1/auth/email/change', { body: values }));
      reset();
      setStatus({ tone: 'succes', text: result.message });
    } catch (error) {
      const byField = fieldMessages(error);
      for (const field of ['newEmail', 'currentPassword'] as const) {
        if (byField[field]) setError(field, { message: byField[field] });
      }
      setStatus({ tone: 'erreur', text: userMessage(error) });
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className={styles.formulaire}>
      <p>
        Adresse actuelle : <strong>{currentEmail}</strong>
      </p>
      <TextField
        label="Nouvelle adresse e-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={errors.newEmail?.message}
        {...register('newEmail')}
      />
      <PasswordField
        label="Mot de passe actuel"
        autoComplete="current-password"
        hint="Pour confirmer que c’est bien vous."
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <FormStatus tone="succes">{status?.tone === 'succes' ? status.text : null}</FormStatus>
      <FormStatus tone="erreur">{status?.tone === 'erreur' ? status.text : null}</FormStatus>
      <div>
        <Button type="submit" variant="secondaire" loading={isSubmitting}>
          Changer mon adresse e-mail
        </Button>
      </div>
    </form>
  );
}

/** Page « Mon profil » : informations personnelles et adresse e-mail de connexion. */
export function ProfilePanel() {
  const profile = useProfile();

  if (profile.isError) {
    return (
      <ErrorState
        title="Votre profil n’a pas pu être chargé"
        action={<Button onClick={() => profile.refetch()}>Réessayer</Button>}
      >
        <p>{userMessage(profile.error)}</p>
      </ErrorState>
    );
  }
  // Le formulaire n'est monté qu'une fois le profil chargé (valeurs par défaut figées).
  if (!profile.data) {
    return <Skeleton height="20rem" radius="14px" />;
  }
  return (
    <>
      <MemberSection id="infos-titre" title="Mes informations">
        <ProfileForm profile={profile.data} />
      </MemberSection>
      <MemberSection
        id="email-titre"
        title="Adresse e-mail"
        intro={
          <p>
            Un lien de confirmation est envoyé à la nouvelle adresse ; l’ancienne reste active tant
            qu’il n’a pas été ouvert.
          </p>
        }
      >
        <EmailChangeForm currentEmail={profile.data.email} />
      </MemberSection>
    </>
  );
}
