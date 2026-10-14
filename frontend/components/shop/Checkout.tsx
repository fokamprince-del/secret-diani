'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { browserApi, unwrap } from '@/lib/api/client';
import { ApiError, fieldMessages, userMessage } from '@/lib/api/errors';
import { type Cart, CSRF, shopApi } from '@/lib/api/shop';
import { formatPrice } from '@/lib/format';
import { type CheckoutValues, checkoutSchema } from '@/lib/forms';
import { useAuth } from '../auth/AuthProvider';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../forms/Field';
import {
  CAPTCHA_PENDING_MESSAGE,
  CaptchaSlot,
  captchaEnabled,
  useCaptcha,
} from '../forms/useCaptcha';
import { COUNTRIES } from '../member/AddressBook';
import { Button, ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { EmptyState, ErrorState, FormStatus, Skeleton } from '../ui/States';
import styles from './Checkout.module.css';

type Methods = { stripe: boolean; paypal: boolean };

/** Jeton de la dernière commande (onglet courant) : reprise du paiement après une annulation. */
export const LAST_ORDER_KEY = 'diani-derniere-commande';

const PROVIDERS = [
  {
    value: 'stripe',
    label: 'Carte bancaire',
    hint: 'Apple Pay et Google Pay acceptés, via Stripe',
  },
  { value: 'paypal', label: 'PayPal', hint: 'Avec ou sans compte PayPal' },
] as const;

/**
 * Commande : coordonnées, livraison ou retrait, adresse, conditions, moyen de paiement. La
 * commande est créée par l'API (montants recalculés, stock réservé 15 minutes), puis la
 * personne est redirigée vers la page de paiement du prestataire : aucune donnée de carte ne
 * passe par le site.
 */
export function Checkout() {
  const { status, user } = useAuth();
  const guest = status !== 'authenticated';
  const [cart, setCart] = useState<Cart | null>(null);
  const [methods, setMethods] = useState<Methods | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ text: string; cartChanged?: boolean } | null>(null);
  const { activate, getToken, reset: resetCaptcha, container } = useCaptcha();

  const deliveryIds = useMemo(
    () =>
      (cart?.shippingOptions ?? [])
        .filter((option) => option.method === 'delivery')
        .map((option) => option.id),
    [cart],
  );
  const schema = useMemo(() => checkoutSchema(guest, deliveryIds), [guest, deliveryIds]);

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      shippingRateId: '',
      shipping: { line1: '', line2: '', postalCode: '', city: '', country: 'FR' },
      billingSame: true,
      billing: {
        firstName: '',
        lastName: '',
        line1: '',
        line2: '',
        postalCode: '',
        city: '',
        country: 'FR',
      },
      note: '',
      acceptTerms: false,
      provider: 'stripe',
    },
  });

  useEffect(() => {
    if (user) {
      setValue('firstName', user.firstName ?? '');
      setValue('lastName', user.lastName ?? '');
    }
  }, [user, setValue]);

  const [shippingRateId, billingSame, shippingCountry] = useWatch({
    control,
    name: ['shippingRateId', 'billingSame', 'shipping.country'],
  });
  const country = shippingCountry || 'FR';

  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;
    Promise.all([
      shopApi.GET('/api/v1/shop/cart', { params: { query: { country } } }).then(unwrap),
      browserApi.GET('/api/v1/payments/methods').then(unwrap),
    ])
      .then(([cartData, methodsData]) => {
        if (cancelled) return;
        setCart(cartData);
        setMethods(methodsData);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(userMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [country, status]);

  const option = cart?.shippingOptions.find((entry) => entry.id === shippingRateId);
  const delivery = option?.method === 'delivery';
  const total = (cart?.subtotalCents ?? 0) + (option?.priceCents ?? 0);

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    const captchaToken = getToken();
    if (captchaEnabled && !captchaToken) {
      setFailure({ text: CAPTCHA_PENDING_MESSAGE });
      return;
    }
    const shippingAddress = delivery
      ? {
          firstName: values.firstName,
          lastName: values.lastName,
          ...values.shipping,
          line2: values.shipping.line2 || null,
        }
      : undefined;
    const billingAddress =
      delivery && values.billingSame
        ? undefined
        : { ...values.billing, line2: values.billing.line2 || null };
    try {
      const order = unwrap(
        await shopApi.POST('/api/v1/shop/checkout', {
          params: { header: CSRF },
          body: {
            email: guest ? values.email : undefined,
            firstName: values.firstName,
            lastName: values.lastName,
            phone: values.phone || null,
            shippingRateId: values.shippingRateId,
            shippingAddress,
            billingAddress,
            note: values.note || null,
            acceptTerms: values.acceptTerms,
            captchaToken,
          },
        }),
      );
      try {
        window.sessionStorage.setItem(LAST_ORDER_KEY, order.trackingToken);
      } catch {
        // Sans stockage, la reprise du paiement passe par le lien de suivi reçu par e-mail.
      }
      const payment = unwrap(
        await browserApi.POST('/api/v1/payments/checkout', {
          body: { token: order.trackingToken, provider: values.provider },
        }),
      );
      window.location.assign(payment.redirectUrl);
    } catch (error) {
      const byField = fieldMessages(error);
      const map: Record<string, Parameters<typeof setError>[0]> = {
        email: 'email',
        firstName: 'firstName',
        lastName: 'lastName',
        phone: 'phone',
        shippingRateId: 'shippingRateId',
        acceptTerms: 'acceptTerms',
        'shippingAddress.line1': 'shipping.line1',
        'shippingAddress.postalCode': 'shipping.postalCode',
        'shippingAddress.city': 'shipping.city',
        'billingAddress.line1': 'billing.line1',
        'billingAddress.postalCode': 'billing.postalCode',
        'billingAddress.city': 'billing.city',
      };
      for (const [field, message] of Object.entries(byField)) {
        const target = map[field];
        if (target) setError(target, { message });
      }
      setFailure({
        text: userMessage(error),
        cartChanged: error instanceof ApiError && error.status === 409,
      });
      resetCaptcha();
    }
  });

  if (loadError) {
    return (
      <ErrorState
        title="La commande ne peut pas être préparée"
        action={<ButtonLink href="/panier">Revenir au panier</ButtonLink>}
      >
        <p>{loadError}</p>
      </ErrorState>
    );
  }
  if (!cart || !methods) return <Skeleton height="24rem" radius="14px" />;
  if (cart.items.length === 0) {
    return (
      <EmptyState
        title="Votre panier est vide"
        icon="bag"
        action={<ButtonLink href="/boutique">Découvrir les kits</ButtonLink>}
      />
    );
  }

  const providers = PROVIDERS.filter((provider) => methods[provider.value]);

  return (
    <form noValidate onSubmit={onSubmit} onFocus={activate} className={styles.commande}>
      <div className={styles.etapes}>
        <fieldset className={styles.etape}>
          <legend className={styles.legende}>1. Vos coordonnées</legend>
          {guest ? (
            <>
              <TextField
                label="Adresse e-mail"
                type="email"
                inputMode="email"
                autoComplete="email"
                hint="Pour la confirmation, la facture et le suivi de la commande."
                error={errors.email?.message}
                {...register('email')}
              />
              <p className={styles.aide}>
                Déjà un compte ? <Link href="/connexion?retour=/commande">Se connecter</Link>
              </p>
            </>
          ) : (
            <p className={styles.aide}>Commande rattachée à votre compte ({user?.email}).</p>
          )}
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
            label="Téléphone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            optional
            hint="Utile au transporteur."
            error={errors.phone?.message}
            {...register('phone')}
          />
        </fieldset>

        <fieldset className={styles.etape}>
          <legend className={styles.legende}>2. Livraison</legend>
          <SelectField
            label="Pays"
            autoComplete="country"
            options={COUNTRIES}
            {...register('shipping.country')}
          />
          {cart.shippingOptions.length === 0 ? (
            <p className={styles.alerte}>
              Pas de livraison vers ce pays pour le moment. Écrivez-nous depuis la page Contact.
            </p>
          ) : (
            <div className={styles.options}>
              {cart.shippingOptions.map((entry) => (
                <label key={entry.id} className={styles.option}>
                  <input type="radio" value={entry.id} {...register('shippingRateId')} />
                  <span className={styles.optionNom}>{entry.name}</span>
                  <span className={styles.optionDetail}>
                    {entry.free || entry.priceCents === 0
                      ? 'Offert'
                      : formatPrice(entry.priceCents)}
                    {entry.delay && ` · ${entry.delay}`}
                    {entry.method === 'pickup' && cart.pickupDetails && ` · ${cart.pickupDetails}`}
                  </span>
                </label>
              ))}
            </div>
          )}
          {errors.shippingRateId && (
            <p id="livraison-erreur" className={styles.erreur}>
              <Icon name="alert" size={18} /> {errors.shippingRateId.message}
            </p>
          )}

          {delivery && (
            <div className={styles.adresse}>
              <TextField
                label="Adresse"
                autoComplete="shipping address-line1"
                error={errors.shipping?.line1?.message}
                {...register('shipping.line1')}
              />
              <TextField
                label="Complément d’adresse"
                optional
                autoComplete="shipping address-line2"
                {...register('shipping.line2')}
              />
              <div className={styles.grille}>
                <TextField
                  label="Code postal"
                  autoComplete="shipping postal-code"
                  error={errors.shipping?.postalCode?.message}
                  {...register('shipping.postalCode')}
                />
                <TextField
                  label="Ville"
                  autoComplete="shipping address-level2"
                  error={errors.shipping?.city?.message}
                  {...register('shipping.city')}
                />
              </div>
              <CheckboxField
                label="Adresse de facturation identique"
                {...register('billingSame')}
              />
            </div>
          )}

          {option && (!delivery || !billingSame) && (
            <div className={styles.adresse}>
              <p className={styles.sousTitre}>Adresse de facturation</p>
              <div className={styles.grille}>
                <TextField
                  label="Prénom (facture)"
                  autoComplete="billing given-name"
                  {...register('billing.firstName')}
                />
                <TextField
                  label="Nom (facture)"
                  autoComplete="billing family-name"
                  error={errors.billing?.lastName?.message}
                  {...register('billing.lastName')}
                />
              </div>
              <TextField
                label="Adresse (facture)"
                autoComplete="billing address-line1"
                error={errors.billing?.line1?.message}
                {...register('billing.line1')}
              />
              <TextField
                label="Complément (facture)"
                optional
                autoComplete="billing address-line2"
                {...register('billing.line2')}
              />
              <div className={styles.grille}>
                <TextField
                  label="Code postal (facture)"
                  autoComplete="billing postal-code"
                  error={errors.billing?.postalCode?.message}
                  {...register('billing.postalCode')}
                />
                <TextField
                  label="Ville (facture)"
                  autoComplete="billing address-level2"
                  error={errors.billing?.city?.message}
                  {...register('billing.city')}
                />
              </div>
              <SelectField
                label="Pays (facture)"
                autoComplete="billing country"
                options={COUNTRIES}
                {...register('billing.country')}
              />
            </div>
          )}
        </fieldset>

        <fieldset className={styles.etape}>
          <legend className={styles.legende}>3. Paiement</legend>
          <div className={styles.options}>
            {providers.map((provider) => (
              <label key={provider.value} className={styles.option}>
                <input type="radio" value={provider.value} {...register('provider')} />
                <span className={styles.optionNom}>{provider.label}</span>
                <span className={styles.optionDetail}>{provider.hint}</span>
              </label>
            ))}
          </div>
          <TextAreaField
            label="Un mot pour Diani"
            optional
            rows={3}
            error={errors.note?.message}
            {...register('note')}
          />
          <CheckboxField
            label={
              <>
                J’accepte les <Link href="/cgv">conditions générales de vente</Link>.
              </>
            }
            error={errors.acceptTerms?.message}
            {...register('acceptTerms')}
          />
        </fieldset>
      </div>

      <aside aria-labelledby="commande-recap" className={styles.recap}>
        <h2 id="commande-recap" className={styles.recapTitre}>
          Votre commande
        </h2>
        <ul role="list" className={styles.lignes}>
          {cart.items.map((line) => (
            <li key={line.variantId}>
              <span>
                {line.productName} <span className={styles.quantite}>× {line.quantity}</span>
              </span>
              <span>{formatPrice(line.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className={styles.montants}>
          <div>
            <dt>Sous-total</dt>
            <dd>{formatPrice(cart.subtotalCents)}</dd>
          </div>
          <div>
            <dt>Livraison</dt>
            <dd>
              {option
                ? option.priceCents === 0
                  ? 'Offerte'
                  : formatPrice(option.priceCents)
                : '—'}
            </dd>
          </div>
          <div className={styles.totalLigne}>
            <dt>Total</dt>
            <dd>{formatPrice(total)}</dd>
          </div>
        </dl>
        <CaptchaSlot container={container} />
        <FormStatus tone="erreur">
          {failure && (
            <>
              {failure.text}
              {failure.cartChanged && (
                <>
                  {' '}
                  <Link href="/panier">Revoir mon panier</Link>
                </>
              )}
            </>
          )}
        </FormStatus>
        <Button type="submit" loading={isSubmitting} fullWidth>
          <Icon name="lock" size={18} />
          Payer {formatPrice(total)}
        </Button>
        <p className={styles.mention}>
          La page de paiement sécurisée du prestataire va s’ouvrir. Le stock est réservé 15 minutes.
        </p>
      </aside>
    </form>
  );
}
