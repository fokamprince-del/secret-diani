'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { browserApi, unwrap } from '@/lib/api/client';
import { fieldMessages, userMessage } from '@/lib/api/errors';
import { PASSWORD_MIN_LENGTH, type RegisterValues, registerSchema } from '@/lib/forms';
import { CheckboxField, TextField } from '../forms/Field';
import { PasswordField } from '../forms/PasswordField';
import { Button } from '../ui/Button';
import { FormStatus } from '../ui/States';
import styles from './AuthForms.module.css';

const FIELDS = ['firstName', 'lastName', 'email', 'password', 'acceptTerms'] as const;

/**
 * Création de compte. Le compte n'est utilisable qu'après le clic sur le lien reçu par e-mail ;
 * la réponse de l'API est la même que l'adresse soit déjà inscrite ou non (pas d'énumération).
 */
export function RegisterForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const sentRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      acceptTerms: false,
      marketingConsent: false,
    },
  });

  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const onSubmit = handleSubmit(async ({ lastName, ...values }) => {
    setFailure(null);
    try {
      const result = unwrap(
        await browserApi.POST('/api/v1/auth/register', {
          body: { ...values, lastName: lastName || undefined },
        }),
      );
      setSent(result.message);
    } catch (error) {
      const byField = fieldMessages(error);
      const invalid = FIELDS.filter((field) => byField[field]);
      for (const field of invalid) setError(field, { message: byField[field] });
      if (invalid[0]) setFocus(invalid[0]);
      setFailure(
        invalid.length > 0 ? 'Corrigez les champs signalés, puis renvoyez.' : userMessage(error),
      );
    }
  });

  if (sent) {
    return (
      <div ref={sentRef} tabIndex={-1} className={`${styles.formulaire} ${styles.confirmation}`}>
        <FormStatus tone="succes">
          {sent} Ouvrez le lien reçu par e-mail pour activer votre compte (pensez à vérifier les
          indésirables).
        </FormStatus>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className={styles.formulaire}>
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
        label="Adresse e-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Mot de passe"
        autoComplete="new-password"
        hint={`${PASSWORD_MIN_LENGTH} caractères au moins. Une phrase facile à retenir fait un excellent mot de passe.`}
        error={errors.password?.message}
        {...register('password')}
      />
      <CheckboxField
        label={
          <>
            J’accepte les <Link href="/cgv">conditions générales</Link> et la{' '}
            <Link href="/confidentialite">politique de confidentialité</Link>.
          </>
        }
        error={errors.acceptTerms?.message}
        {...register('acceptTerms')}
      />
      <CheckboxField
        label="Je souhaite recevoir les nouvelles des Secrets de Diani par e-mail (facultatif, désinscription en un clic)."
        {...register('marketingConsent')}
      />
      <FormStatus tone="erreur">{failure}</FormStatus>
      <div>
        <Button type="submit" loading={isSubmitting} fullWidth>
          Créer mon compte
        </Button>
      </div>
    </form>
  );
}
