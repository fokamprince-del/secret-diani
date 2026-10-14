'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { browserApi, unwrap } from '@/lib/api/client';
import { ApiError, userMessage } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';
import { mergeGuestCart } from '@/lib/api/shop';
import { safeReturnPath } from '@/lib/auth/navigation';
import { startSession } from '@/lib/auth/session';
import { readCartCount, writeCartCount } from '@/lib/cart-hint';
import { type LoginValues, loginSchema, type MfaCodeValues, mfaCodeSchema } from '@/lib/forms';
import { PasswordField } from '../forms/PasswordField';
import { TextField } from '../forms/Field';
import { Button } from '../ui/Button';
import { FormStatus } from '../ui/States';
import styles from './AuthForms.module.css';

type Authenticated = components['schemas']['AuthenticatedResponseDto'];
type Challenge = components['schemas']['MfaChallengeResponseDto'];
type Step =
  | { kind: 'credentials' }
  | { kind: 'mfa'; mfaToken: string }
  | { kind: 'enroll'; mfaToken: string; secret: string; otpauthUrl: string }
  | { kind: 'backup-codes'; codes: string[]; session: Authenticated };

/**
 * Connexion : e-mail et mot de passe ; pour l'administration, second facteur (code de
 * l'application ou code de secours) et, à la première connexion, configuration de l'application.
 * Les messages d'échec restent génériques (aucune indication sur l'existence du compte).
 */
export function LoginForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [failure, setFailure] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  const credentials = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const mfa = useForm<MfaCodeValues>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: '' },
  });

  const finish = async (data: Authenticated) => {
    startSession(data);
    // Le panier invité rejoint celui du compte (aucun appel s'il n'y en a pas).
    if (readCartCount() > 0) {
      const cart = await mergeGuestCart();
      if (cart) writeCartCount(cart.itemCount);
    }
    router.replace(safeReturnPath(returnTo));
    router.refresh();
  };

  const onCredentials = credentials.handleSubmit(async (values) => {
    setFailure(null);
    setNotice(null);
    setUnverifiedEmail(null);
    try {
      const data = unwrap(await browserApi.POST('/api/v1/auth/login', { body: values })) as
        Authenticated | Challenge;
      if (data.status === 'authenticated') return await finish(data);
      if (data.status === 'mfa_required') {
        setStep({ kind: 'mfa', mfaToken: data.mfaToken });
        return;
      }
      const enrollment = unwrap(
        await browserApi.POST('/api/v1/auth/2fa/enroll', { body: { mfaToken: data.mfaToken } }),
      );
      setStep({ kind: 'enroll', mfaToken: data.mfaToken, ...enrollment });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(values.email);
      }
      setFailure(userMessage(error));
      credentials.resetField('password');
      credentials.setFocus('password');
    }
  });

  const onCode = mfa.handleSubmit(async ({ code }) => {
    if (step.kind !== 'mfa' && step.kind !== 'enroll') return;
    setFailure(null);
    try {
      if (step.kind === 'mfa') {
        await finish(
          unwrap(
            await browserApi.POST('/api/v1/auth/2fa/verify', {
              body: { mfaToken: step.mfaToken, code },
            }),
          ),
        );
        return;
      }
      const enrolled = unwrap(
        await browserApi.POST('/api/v1/auth/2fa/enroll/confirm', {
          body: { mfaToken: step.mfaToken, code },
        }),
      );
      setStep({ kind: 'backup-codes', codes: enrolled.backupCodes, session: enrolled });
    } catch (error) {
      setFailure(userMessage(error));
      mfa.reset();
      mfa.setFocus('code');
    }
  });

  const onBackupCode = async () => {
    if (step.kind !== 'mfa') return;
    setFailure(null);
    try {
      await finish(
        unwrap(
          await browserApi.POST('/api/v1/auth/2fa/verify', {
            body: { mfaToken: step.mfaToken, backupCode: backupCode.trim() },
          }),
        ),
      );
    } catch (error) {
      setFailure(userMessage(error));
    }
  };

  const resend = async () => {
    if (!unverifiedEmail) return;
    try {
      const result = unwrap(
        await browserApi.POST('/api/v1/auth/email/resend', { body: { email: unverifiedEmail } }),
      );
      setFailure(null);
      setNotice(result.message);
    } catch (error) {
      setFailure(userMessage(error));
    }
  };

  if (step.kind === 'backup-codes') {
    return (
      <div className={styles.formulaire}>
        <FormStatus tone="succes">
          L’application est configurée. Voici vos codes de secours : chacun ne sert qu’une fois, si
          vous n’avez plus accès à votre téléphone. Notez-les en lieu sûr, ils ne seront plus
          affichés.
        </FormStatus>
        <ul className={styles.codes} aria-label="Codes de secours">
          {step.codes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ul>
        <div>
          <Button onClick={() => void finish(step.session)} withArrow>
            J’ai noté mes codes, continuer
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === 'mfa' || step.kind === 'enroll') {
    return (
      <div className={styles.formulaire}>
        {step.kind === 'enroll' ? (
          <div className={styles.etape}>
            <p>
              Première connexion à l’administration : configurez une application d’authentification
              (Google Authenticator, 1Password, Authy…).
            </p>
            <p>
              <a href={step.otpauthUrl}>Ouvrir dans mon application</a>, ou saisissez cette clé :{' '}
              <code className={styles.secret}>{step.secret}</code>
            </p>
          </div>
        ) : (
          <p className={styles.etape}>
            Saisissez le code à 6 chiffres affiché par votre application d’authentification.
          </p>
        )}

        {!useBackup && (
          <form noValidate onSubmit={onCode} className={styles.formulaire}>
            <TextField
              label="Code de vérification"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              error={mfa.formState.errors.code?.message}
              {...mfa.register('code')}
            />
            <FormStatus tone="erreur">{failure}</FormStatus>
            <div>
              <Button type="submit" loading={mfa.formState.isSubmitting}>
                Valider le code
              </Button>
            </div>
          </form>
        )}

        {step.kind === 'mfa' &&
          (useBackup ? (
            <div className={styles.formulaire}>
              <TextField
                label="Code de secours"
                autoComplete="off"
                value={backupCode}
                onChange={(event) => setBackupCode(event.target.value)}
              />
              <FormStatus tone="erreur">{failure}</FormStatus>
              <div>
                <Button onClick={onBackupCode}>Valider le code de secours</Button>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.lienBouton} onClick={() => setUseBackup(true)}>
              Je n’ai pas mon téléphone : utiliser un code de secours
            </button>
          ))}
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onCredentials} className={styles.formulaire}>
      <TextField
        label="Adresse e-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={credentials.formState.errors.email?.message}
        {...credentials.register('email')}
      />
      <PasswordField
        label="Mot de passe"
        autoComplete="current-password"
        error={credentials.formState.errors.password?.message}
        {...credentials.register('password')}
      />
      <p className={styles.oubli}>
        <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
      </p>
      <FormStatus tone="erreur">
        {failure && (
          <>
            {failure}
            {unverifiedEmail && (
              <>
                {' '}
                <button type="button" className={styles.lienBouton} onClick={resend}>
                  Renvoyer l’e-mail de confirmation
                </button>
              </>
            )}
          </>
        )}
      </FormStatus>
      <FormStatus tone="succes">{notice}</FormStatus>
      <div>
        <Button type="submit" loading={credentials.formState.isSubmitting} fullWidth>
          Se connecter
        </Button>
      </div>
    </form>
  );
}
