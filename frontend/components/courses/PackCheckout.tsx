'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authedApi } from '@/lib/api/authed';
import { browserApi, unwrap } from '@/lib/api/client';
import { ApiError, userMessage } from '@/lib/api/errors';
import type { Pack } from '@/lib/api/types';
import { formatPrice } from '@/lib/format';
import { useAuth } from '../auth/AuthProvider';
import { CheckboxField, SelectField, TextField } from '../forms/Field';
import {
  CAPTCHA_PENDING_MESSAGE,
  CaptchaSlot,
  captchaEnabled,
  useCaptcha,
} from '../forms/useCaptcha';
import { COUNTRIES } from '../member/AddressBook';
import { LAST_ORDER_KEY } from '../shop/Checkout';
import { Button, ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { ErrorState, FormStatus, Skeleton } from '../ui/States';
import styles from '../shop/Checkout.module.css';

const schema = z.object({
  firstName: z.string().trim().min(1, 'Indiquez votre prénom.').max(100),
  lastName: z.string().trim().min(1, 'Indiquez votre nom.').max(100),
  line1: z.string().trim().min(3, 'Indiquez l’adresse.').max(200),
  line2: z.string().trim().max(200),
  postalCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,10}$/, 'Vérifiez le code postal.'),
  city: z.string().trim().min(1, 'Indiquez la ville.').max(100),
  country: z.string().length(2),
  acceptTerms: z.boolean().refine((value) => value, {
    message: 'Acceptez les conditions générales de vente pour commander.',
  }),
  provider: z.enum(['stripe', 'paypal']),
});
type Values = z.infer<typeof schema>;

/**
 * Achat d'un pack : compte obligatoire (sinon connexion, avec retour ici), adresse de
 * facturation, conditions, moyen de paiement, puis redirection vers la page de paiement.
 * L'accès aux formations s'ouvre seulement quand l'API a reçu la confirmation du paiement.
 */
export function PackCheckout({ slug }: { slug: string }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const [pack, setPack] = useState<Pack | null | undefined>(undefined);
  const [salesOpen, setSalesOpen] = useState(true);
  const [methods, setMethods] = useState<{ stripe: boolean; paypal: boolean } | null>(null);
  const [failure, setFailure] = useState<{ text: string; owned?: boolean } | null>(null);
  const { activate, getToken, reset, container } = useCaptcha();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/connexion?retour=${encodeURIComponent(`/commande/pack/${slug}`)}`);
    }
  }, [status, router, slug]);

  useEffect(() => {
    Promise.all([
      browserApi.GET('/api/v1/courses/packs').then(unwrap),
      browserApi.GET('/api/v1/site/settings').then(unwrap),
      browserApi.GET('/api/v1/payments/methods').then(unwrap),
    ]).then(
      ([packs, settings, paymentMethods]) => {
        setMethods(paymentMethods);
        setPack(packs.find((entry) => entry.slug === slug) ?? null);
        setSalesOpen(settings.features.courseSalesOpen);
      },
      () => setPack(null),
    );
  }, [slug]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      line1: '',
      line2: '',
      postalCode: '',
      city: '',
      country: 'FR',
      acceptTerms: false,
      provider: 'stripe',
    },
  });

  useEffect(() => {
    if (methods && !methods.stripe && methods.paypal) setValue('provider', 'paypal');
  }, [methods, setValue]);

  useEffect(() => {
    if (user) {
      setValue('firstName', user.firstName ?? '');
      setValue('lastName', user.lastName ?? '');
    }
  }, [user, setValue]);

  const onSubmit = handleSubmit(async ({ acceptTerms, provider, line2, ...address }) => {
    setFailure(null);
    const captchaToken = getToken();
    if (captchaEnabled && !captchaToken) {
      setFailure({ text: CAPTCHA_PENDING_MESSAGE });
      return;
    }
    try {
      const order = unwrap(
        await authedApi.POST('/api/v1/courses/packs/{slug}/checkout', {
          params: { path: { slug } },
          body: { billingAddress: { ...address, line2: line2 || null }, acceptTerms, captchaToken },
        }),
      );
      try {
        window.sessionStorage.setItem(LAST_ORDER_KEY, order.trackingToken);
      } catch {
        // Reprise possible depuis le lien de suivi reçu par e-mail.
      }
      const payment = unwrap(
        await browserApi.POST('/api/v1/payments/checkout', {
          body: { token: order.trackingToken, provider },
        }),
      );
      window.location.assign(payment.redirectUrl);
    } catch (error) {
      setFailure({
        text: userMessage(error),
        owned: error instanceof ApiError && error.status === 409,
      });
      reset();
    }
  });

  if (status !== 'authenticated' || pack === undefined)
    return <Skeleton height="20rem" radius="14px" />;
  if (pack === null) {
    return (
      <ErrorState
        title="Ce pack est introuvable"
        action={<ButtonLink href="/formations">Voir les packs</ButtonLink>}
      />
    );
  }
  if (!salesOpen) {
    return (
      <ErrorState
        title="Les inscriptions sont momentanément fermées"
        action={<ButtonLink href="/formations">Revenir aux formations</ButtonLink>}
      >
        <p>Elles rouvrent bientôt. Vos formations déjà achetées restent accessibles.</p>
      </ErrorState>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} onFocus={activate} className={styles.commande}>
      <div className={styles.etapes}>
        <fieldset className={styles.etape}>
          <legend className={styles.legende}>Adresse de facturation</legend>
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
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>
          <TextField
            label="Adresse"
            autoComplete="address-line1"
            error={errors.line1?.message}
            {...register('line1')}
          />
          <TextField
            label="Complément d’adresse"
            optional
            autoComplete="address-line2"
            {...register('line2')}
          />
          <div className={styles.grille}>
            <TextField
              label="Code postal"
              autoComplete="postal-code"
              error={errors.postalCode?.message}
              {...register('postalCode')}
            />
            <TextField
              label="Ville"
              autoComplete="address-level2"
              error={errors.city?.message}
              {...register('city')}
            />
          </div>
          <SelectField
            label="Pays"
            autoComplete="country"
            options={COUNTRIES}
            {...register('country')}
          />
        </fieldset>
        <fieldset className={styles.etape}>
          <legend className={styles.legende}>Paiement</legend>
          {methods && !methods.stripe && !methods.paypal && (
            <p className={styles.alerte} role="status">
              Le paiement en ligne est momentanément indisponible. Réessayez un peu plus tard, ou{' '}
              <Link href="/contact">écrivez-nous</Link>.
            </p>
          )}
          <div className={styles.options}>
            {methods?.stripe && (
              <label className={styles.option}>
                <input type="radio" value="stripe" {...register('provider')} />
                <span className={styles.optionNom}>Carte bancaire</span>
                <span className={styles.optionDetail}>
                  Apple Pay et Google Pay acceptés, via Stripe
                </span>
              </label>
            )}
            {methods?.paypal && (
              <label className={styles.option}>
                <input type="radio" value="paypal" {...register('provider')} />
                <span className={styles.optionNom}>PayPal</span>
                <span className={styles.optionDetail}>Avec ou sans compte PayPal</span>
              </label>
            )}
          </div>
          <CheckboxField
            label={
              <>
                J’accepte les <Link href="/cgv">conditions générales de vente</Link> et je demande
                l’accès immédiat aux contenus.
              </>
            }
            error={errors.acceptTerms?.message}
            {...register('acceptTerms')}
          />
        </fieldset>
      </div>

      <aside aria-labelledby="pack-recap" className={styles.recap}>
        <h2 id="pack-recap" className={styles.recapTitre}>
          Pack {pack.name}
        </h2>
        <ul className={styles.lignes}>
          {pack.features.map((feature) => (
            <li key={feature}>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <dl className={styles.montants}>
          <div className={styles.totalLigne}>
            <dt>Total</dt>
            <dd>{formatPrice(pack.priceCents)}</dd>
          </div>
        </dl>
        <CaptchaSlot container={container} />
        <FormStatus tone="erreur">
          {failure && (
            <>
              {failure.text}
              {failure.owned && (
                <>
                  {' '}
                  <Link href="/espace-membre/formations">Mes formations</Link>
                </>
              )}
            </>
          )}
        </FormStatus>
        <Button
          type="submit"
          loading={isSubmitting}
          disabled={!methods || (!methods.stripe && !methods.paypal)}
          fullWidth
        >
          <Icon name="lock" size={18} />
          Payer {formatPrice(pack.priceCents)}
        </Button>
        <p className={styles.mention}>
          Accès ouvert dès la confirmation du paiement, depuis « Mes formations ».
        </p>
      </aside>
    </form>
  );
}
