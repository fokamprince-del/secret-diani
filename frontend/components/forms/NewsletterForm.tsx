'use client';

import { type FormEvent, useRef, useState } from 'react';
import { browserApi, unwrap } from '@/lib/api/client';
import { fieldMessages, userMessage } from '@/lib/api/errors';
import {
  emailError,
  NEWSLETTER_CONSENT_MISSING,
  NEWSLETTER_CONSENT_TEXT,
} from '@/lib/form-messages';
import { Button } from '../ui/Button';
import { FormStatus } from '../ui/States';
import { CheckboxField, HoneypotField, TextField } from './Field';
import { CAPTCHA_PENDING_MESSAGE, CaptchaSlot, captchaEnabled, useCaptcha } from './useCaptcha';
import styles from './NewsletterForm.module.css';

type Errors = { email?: string; consent?: string };

/**
 * Inscription à la newsletter en double opt-in : l'API envoie un e-mail de confirmation,
 * rien n'est activé avant le clic sur le lien. Le consentement est une case à cocher explicite.
 *
 * Présent dans le pied de page de toutes les pages : validation native et légère, sans
 * bibliothèque de formulaire (budget JavaScript, DECISIONS D-F11).
 */
export function NewsletterForm() {
  const { activate, getToken, reset, container } = useCaptcha();
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<{ tone: 'succes' | 'erreur'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const consent = data.get('consent') === 'on';
    const website = String(data.get('website') ?? '');

    const found: Errors = {
      email: emailError(email) ?? undefined,
      consent: consent ? undefined : NEWSLETTER_CONSENT_MISSING,
    };
    setErrors(found);
    setStatus(null);
    if (found.email) return emailRef.current?.focus();
    if (found.consent) return consentRef.current?.focus();

    const captchaToken = getToken();
    if (captchaEnabled && !captchaToken) {
      setStatus({ tone: 'erreur', text: CAPTCHA_PENDING_MESSAGE });
      return;
    }
    setSubmitting(true);
    try {
      const result = unwrap(
        await browserApi.POST('/api/v1/newsletter/subscribe', {
          body: { email, consent, website: website || undefined, captchaToken },
        }),
      );
      form.reset();
      setStatus({ tone: 'succes', text: result.message });
    } catch (error) {
      const message = fieldMessages(error).email;
      if (message) {
        setErrors({ email: message });
        emailRef.current?.focus();
      }
      setStatus({
        tone: 'erreur',
        text: message ? 'Vérifiez votre adresse e-mail.' : userMessage(error),
      });
    } finally {
      setSubmitting(false);
      reset();
    }
  };

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      onFocus={activate}
      className={styles.formulaire}
      aria-labelledby="newsletter-titre"
    >
      <h2 id="newsletter-titre" className={styles.titre}>
        La lettre de Diani
      </h2>
      <p className={styles.texte}>
        Mes recettes, mes astuces et les nouveautés, directement dans votre boîte mail.
      </p>
      <TextField
        ref={emailRef}
        name="email"
        label="Votre e-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={errors.email}
      />
      <CheckboxField
        ref={consentRef}
        name="consent"
        label={NEWSLETTER_CONSENT_TEXT}
        error={errors.consent}
      />
      <HoneypotField name="website" />
      <CaptchaSlot container={container} />
      {/* Deux régions toujours montées : l'annonce reste fiable quel que soit le résultat. */}
      <FormStatus tone="succes">{status?.tone === 'succes' ? status.text : null}</FormStatus>
      <FormStatus tone="erreur">{status?.tone === 'erreur' ? status.text : null}</FormStatus>
      <div>
        <Button type="submit" variant="secondaire" loading={submitting}>
          M’inscrire à la lettre
        </Button>
      </div>
    </form>
  );
}
