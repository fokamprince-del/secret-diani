'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { browserApi, unwrap } from '@/lib/api/client';
import { fieldMessages, userMessage } from '@/lib/api/errors';
import type { CateringConditions, CateringReceipt, CateringSlot } from '@/lib/api/types';
import { depositHint, describeChoice, isoDateIn, selectionTotal } from '@/lib/catering';
import { formatDate, formatPrice } from '@/lib/format';
import { type CateringRequestValues, cateringRequestSchema } from '@/lib/forms';
import { HoneypotField, SelectField, TextAreaField, TextField } from '../forms/Field';
import {
  CAPTCHA_PENDING_MESSAGE,
  CaptchaSlot,
  captchaEnabled,
  useCaptcha,
} from '../forms/useCaptcha';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { FormStatus } from '../ui/States';
import { MAX_QUANTITY, useSelection } from './SelectionProvider';
import styles from './RequestForm.module.css';

const FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'eventDate',
  'guestCount',
  'fulfilment',
  'deliveryAddress',
  'message',
  'slotId',
] as const;

const slotFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/**
 * Demande personnalisée (date, invités, message, sélection facultative). Sans paiement :
 * Diani recontacte, confirme puis demande l'acompte. Si la commande en ligne est ouverte
 * dans l'administration (`onlineOrdering`), un créneau est demandé et la demande devient
 * une commande (parcours avancé, masqué par défaut).
 */
export function RequestForm({ conditions }: { conditions: CateringConditions }) {
  const { items, setQuantity, remove, clear } = useSelection();
  const { activate, getToken, reset, container } = useCaptcha();
  const [receipt, setReceipt] = useState<CateringReceipt | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [slots, setSlots] = useState<CateringSlot[] | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const online = conditions.onlineOrdering;

  // Date minimale (délai de préparation) : la page est générée à l'avance, la date du jour
  // n'est donc calculée que dans le navigateur (sinon le HTML et l'hydratation divergeraient).
  const [minDate, setMinDate] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinDate(isoDateIn(conditions.minNoticeDays));
  }, [conditions.minNoticeDays]);
  const minDateLabel = minDate ? formatDate(`${minDate}T12:00:00Z`) : '';
  const schema = useMemo(
    () => cateringRequestSchema(minDate ?? isoDateIn(conditions.minNoticeDays), minDateLabel),
    [minDate, minDateLabel, conditions.minNoticeDays],
  );

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CateringRequestValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      eventDate: '',
      guestCount: '',
      fulfilment: 'pickup',
      deliveryAddress: '',
      message: '',
      slotId: '',
      website: '',
    },
  });
  const fulfilment = useWatch({ control, name: 'fulfilment' });

  // Parcours avancé : créneaux disponibles pour le mode choisi.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    browserApi
      .GET('/api/v1/catering/slots', { params: { query: { fulfilment } } })
      .then((result) => {
        if (!cancelled) setSlots(unwrap(result));
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [online, fulfilment]);

  useEffect(() => {
    if (receipt) receiptRef.current?.focus();
  }, [receipt]);

  const total = selectionTotal(items);

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    if (online && !values.slotId) {
      setError('slotId', { message: 'Choisissez un créneau.' });
      setFocus('slotId');
      return;
    }
    const captchaToken = getToken();
    if (captchaEnabled && !captchaToken) {
      setFailure(CAPTCHA_PENDING_MESSAGE);
      return;
    }
    const body = {
      firstName: values.firstName,
      lastName: values.lastName || null,
      email: values.email,
      phone: values.phone || null,
      eventDate: values.eventDate,
      guestCount: values.guestCount ? Number(values.guestCount) : null,
      fulfilment: values.fulfilment,
      deliveryAddress: values.fulfilment === 'delivery' ? values.deliveryAddress : null,
      message: values.message || null,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        flavourIds: item.flavourIds,
      })),
      website: values.website || undefined,
      captchaToken,
    };
    try {
      const result = unwrap(
        online
          ? await browserApi.POST('/api/v1/catering/orders', {
              body: { ...body, slotId: values.slotId },
            })
          : await browserApi.POST('/api/v1/catering-requests', { body }),
      );
      clear();
      setReceipt(result);
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

  if (receipt) {
    return (
      <div ref={receiptRef} tabIndex={-1} className={styles.recu}>
        <FormStatus tone="succes">
          <p>{receipt.message}</p>
          <p>
            Référence de votre demande : <strong>{receipt.reference}</strong>
          </p>
          {receipt.estimatedTotalCents !== null && (
            <p>
              Estimation de votre sélection : {formatPrice(receipt.estimatedTotalCents)}.{' '}
              {depositHint(receipt.estimatedTotalCents, conditions.deposit)}
            </p>
          )}
        </FormStatus>
        {receipt.whatsappUrl && (
          <a
            href={receipt.whatsappUrl}
            className={`${styles.whatsapp} sans-filet`}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon name="whatsapp" size={20} />
            Poursuivre sur WhatsApp
            <span className="visually-hidden"> (nouvel onglet)</span>
          </a>
        )}
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} onFocus={activate} className={styles.formulaire}>
      <section aria-labelledby="selection-titre" className={styles.selection}>
        <h3 id="selection-titre" className={styles.sousTitre}>
          Votre sélection
        </h3>
        {items.length === 0 ? (
          <p>
            Facultatif : utilisez « Ajouter à ma demande » sur les produits, ou décrivez simplement
            votre envie dans le message.
          </p>
        ) : (
          <>
            <ul role="list" className={styles.lignes}>
              {items.map((item) => {
                const label = describeChoice(
                  item.productName,
                  item.variantLabel,
                  item.flavourNames,
                );
                return (
                  <li key={item.key} className={styles.ligne}>
                    <span className={styles.ligneNom}>{label}</span>
                    <label className={styles.quantite}>
                      <span className="visually-hidden">Quantité pour {label}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_QUANTITY}
                        value={item.quantity}
                        onChange={(event) => setQuantity(item.key, Number(event.target.value))}
                      />
                    </label>
                    <span className={styles.lignePrix}>
                      {formatPrice(item.priceCents * item.quantity)}
                    </span>
                    <button
                      type="button"
                      className={styles.retirer}
                      onClick={() => remove(item.key)}
                    >
                      <Icon name="close" size={18} />
                      <span className="visually-hidden">Retirer {label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className={styles.total}>
              Estimation : <strong>{formatPrice(total)}</strong>
              <span className={styles.totalAide}>
                {' '}
                · prix indicatif, confirmé par Diani. {depositHint(total, conditions.deposit)}
              </span>
            </p>
          </>
        )}
      </section>

      <div className={styles.grille}>
        <TextField
          label="Votre prénom"
          autoComplete="given-name"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          label="Votre nom"
          autoComplete="family-name"
          optional
          error={errors.lastName?.message}
          {...register('lastName')}
        />
        <TextField
          label="Votre e-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Votre téléphone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          optional
          hint="Pratique pour caler les détails rapidement."
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          label="Date de l’événement"
          type="date"
          min={minDate ?? undefined}
          hint={minDate ? `À partir du ${minDateLabel}.` : undefined}
          error={errors.eventDate?.message}
          {...register('eventDate')}
        />
        <TextField
          label="Nombre d’invités"
          type="number"
          inputMode="numeric"
          min={1}
          max={5000}
          optional
          error={errors.guestCount?.message}
          {...register('guestCount')}
        />
      </div>

      <fieldset className={styles.mode}>
        <legend className={styles.legende}>Retrait ou livraison</legend>
        <label className={styles.choix}>
          <input type="radio" value="pickup" {...register('fulfilment')} />
          Je viens chercher ma commande
        </label>
        <label className={styles.choix}>
          <input type="radio" value="delivery" {...register('fulfilment')} />
          Je souhaite une livraison
        </label>
      </fieldset>
      {fulfilment === 'delivery' && (
        <TextField
          label="Ville ou adresse de livraison"
          autoComplete="street-address"
          error={errors.deliveryAddress?.message}
          {...register('deliveryAddress')}
        />
      )}

      {online && (
        <SelectField
          label="Créneau"
          options={[
            {
              value: '',
              label: slots === null ? 'Chargement des créneaux…' : 'Choisir un créneau',
            },
            ...(slots ?? []).map((slot) => ({
              value: slot.id,
              label: `${slotFormatter.format(new Date(slot.startsAt))} (${slot.remaining} place${slot.remaining > 1 ? 's' : ''})`,
            })),
          ]}
          error={errors.slotId?.message}
          {...register('slotId')}
        />
      )}

      <TextAreaField
        label="Votre message"
        optional
        rows={5}
        hint="L’occasion, vos envies, une allergie à signaler…"
        error={errors.message?.message}
        {...register('message')}
      />
      <HoneypotField {...register('website')} />
      <CaptchaSlot container={container} />
      <FormStatus tone="erreur">{failure}</FormStatus>
      <div>
        <Button type="submit" loading={isSubmitting} withArrow>
          {online ? 'Envoyer ma commande' : 'Envoyer ma demande'}
        </Button>
      </div>
      <p className={styles.mention}>
        Aucun paiement maintenant : je vous recontacte pour confirmer, puis je vous demande
        l’acompte.
      </p>
    </form>
  );
}
