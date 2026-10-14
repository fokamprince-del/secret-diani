'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { browserApi, unwrap } from '@/lib/api/client';
import { fieldMessages, userMessage } from '@/lib/api/errors';
import {
  type ForgotValues,
  forgotSchema,
  type NewPasswordValues,
  newPasswordSchema,
  PASSWORD_MIN_LENGTH,
} from '@/lib/forms';
import { TextField } from '../forms/Field';
import { PasswordField } from '../forms/PasswordField';
import { useUrlToken } from '../forms/useUrlToken';
import { Button, ButtonLink } from '../ui/Button';
import { FormStatus } from '../ui/States';
import styles from './AuthForms.module.css';

/** Mot de passe oublié : même réponse que le compte existe ou non (pas d'énumération). */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      setSent(
        unwrap(await browserApi.POST('/api/v1/auth/password/forgot', { body: values })).message,
      );
    } catch (error) {
      setFailure(userMessage(error));
    }
  });

  if (sent) return <FormStatus tone="succes">{sent}</FormStatus>;
  return (
    <form noValidate onSubmit={onSubmit} className={styles.formulaire}>
      <TextField
        label="Adresse e-mail du compte"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormStatus tone="erreur">{failure}</FormStatus>
      <div>
        <Button type="submit" loading={isSubmitting} fullWidth>
          Recevoir le lien
        </Button>
      </div>
    </form>
  );
}

/** Nouveau mot de passe à partir du lien reçu (valable 30 minutes, usage unique). */
export function ResetPasswordForm() {
  const token = useUrlToken();
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    setFailure(null);
    try {
      const result = unwrap(
        await browserApi.POST('/api/v1/auth/password/reset', { body: { token, password } }),
      );
      setDone(result.message);
    } catch (error) {
      const message = fieldMessages(error).password;
      if (message) setError('password', { message });
      setFailure(message ? 'Choisissez un autre mot de passe.' : userMessage(error));
    }
  });

  if (token === undefined) return null;
  if (!token) {
    return (
      <FormStatus tone="erreur">
        Ce lien est incomplet. Ouvrez le lien reçu par e-mail tel quel, ou demandez-en un nouveau.
      </FormStatus>
    );
  }
  if (done) {
    return (
      <div className={styles.formulaire}>
        <FormStatus tone="succes">{done}</FormStatus>
        <div>
          <ButtonLink href="/connexion" withArrow>
            Se connecter
          </ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <form noValidate onSubmit={onSubmit} className={styles.formulaire}>
      <PasswordField
        label="Nouveau mot de passe"
        autoComplete="new-password"
        hint={`${PASSWORD_MIN_LENGTH} caractères au moins.`}
        error={errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Confirmez le mot de passe"
        autoComplete="new-password"
        error={errors.confirmation?.message}
        {...register('confirmation')}
      />
      <FormStatus tone="erreur">{failure}</FormStatus>
      <div>
        <Button type="submit" loading={isSubmitting} fullWidth>
          Enregistrer mon mot de passe
        </Button>
      </div>
    </form>
  );
}
