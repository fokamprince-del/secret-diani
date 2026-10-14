'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { browserApi, unwrap } from '@/lib/api/client';
import { fieldMessages, userMessage } from '@/lib/api/errors';
import { CONTACT_SUBJECTS, type ContactValues, contactSchema } from '@/lib/forms';
import { Button } from '../ui/Button';
import { FormStatus } from '../ui/States';
import { HoneypotField, SelectField, TextAreaField, TextField } from './Field';
import { CAPTCHA_PENDING_MESSAGE, CaptchaSlot, captchaEnabled, useCaptcha } from './useCaptcha';
import styles from './Form.module.css';

const FIELDS = ['name', 'email', 'phone', 'subject', 'message'] as const;

/**
 * Formulaire de contact court : erreurs décrites sous chaque champ et annoncées, piège à robots,
 * anti-robot discret. Après l'envoi, le message de l'API remplace le formulaire.
 */
export function ContactForm() {
  const { activate, getToken, reset, container } = useCaptcha();
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', phone: '', subject: 'general', message: '', website: '' },
    shouldFocusError: true,
  });

  // Le message de réussite remplace le formulaire : le focus y est déplacé (lecteurs d'écran).
  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const onSubmit = handleSubmit(async ({ phone, website, ...values }) => {
    setFailure(null);
    const captchaToken = getToken();
    if (captchaEnabled && !captchaToken) {
      setFailure(CAPTCHA_PENDING_MESSAGE);
      return;
    }
    try {
      const result = unwrap(
        await browserApi.POST('/api/v1/contact', {
          body: { ...values, phone: phone || null, website: website || undefined, captchaToken },
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
    } finally {
      reset();
    }
  });

  if (sent) {
    return (
      <div ref={successRef} tabIndex={-1} className={styles.confirmation}>
        <FormStatus tone="succes">{sent}</FormStatus>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} onFocus={activate} className={styles.formulaire}>
      <TextField
        label="Votre nom"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Votre e-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        hint="Pour vous répondre, rien d’autre."
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Votre téléphone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        optional
        error={errors.phone?.message}
        {...register('phone')}
      />
      <SelectField
        label="Le sujet"
        options={CONTACT_SUBJECTS}
        error={errors.subject?.message}
        {...register('subject')}
      />
      <TextAreaField
        label="Votre message"
        rows={6}
        error={errors.message?.message}
        {...register('message')}
      />
      <HoneypotField {...register('website')} />
      <CaptchaSlot container={container} />
      <FormStatus tone="erreur">{failure}</FormStatus>
      <div>
        <Button type="submit" loading={isSubmitting} withArrow>
          Envoyer mon message
        </Button>
      </div>
    </form>
  );
}
