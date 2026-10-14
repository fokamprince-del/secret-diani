'use client';

import { useEffect, useState } from 'react';
import { browserApi, unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import type { Order } from '@/lib/api/types';
import { writeCartCount } from '@/lib/cart-hint';
import { formatPrice } from '@/lib/format';
import { useUrlToken } from '../forms/useUrlToken';
import { Button, ButtonLink } from '../ui/Button';
import { ErrorState, FormStatus, Skeleton } from '../ui/States';
import { LAST_ORDER_KEY } from './Checkout';
import { OrderView } from './OrderView';
import styles from './PaymentPages.module.css';

const trackOrder = async (token: string) =>
  unwrap(await browserApi.GET('/api/v1/shop/orders/track', { params: { query: { token } } }));

const invoiceFor = (token: string) => async () =>
  unwrap(
    await browserApi.GET('/api/v1/shop/orders/track/invoice', { params: { query: { token } } }),
  ).url;

const trackingHref = (token: string) => `/commande/suivi?token=${encodeURIComponent(token)}`;

/** Attente de la confirmation du paiement (webhook Stripe) : quelques secondes au plus. */
const POLL_MS = 2_000;
const POLL_MAX = 15;

type ReturnState =
  | { kind: 'waiting' }
  | { kind: 'paid'; order: Order }
  | { kind: 'pending'; order: Order }
  | { kind: 'error'; message: string };

/**
 * Retour du prestataire après paiement. PayPal : le site demande la capture du paiement.
 * Stripe : la commande est confirmée par le webhook ; on attend son passage à « payée ».
 * Rien n'est considéré payé tant que l'API ne l'a pas confirmé.
 */
export function PaymentReturn() {
  const token = useUrlToken('suivi');
  const provider = useUrlToken('moyen');
  const [state, setState] = useState<ReturnState>({ kind: 'waiting' });

  useEffect(() => {
    if (token === undefined || provider === undefined) return;
    if (!token) {
      // Lien incomplet : rien à confirmer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: 'error', message: 'Ce lien de retour est incomplet.' });
      return;
    }
    let cancelled = false;
    const settle = (order: Order) => {
      if (cancelled) return;
      if (order.status === 'pending_payment') {
        setState({ kind: 'pending', order });
        return;
      }
      writeCartCount(0);
      try {
        window.sessionStorage.removeItem(LAST_ORDER_KEY);
      } catch {
        // Rien à nettoyer.
      }
      setState({ kind: 'paid', order });
    };

    (async () => {
      try {
        if (provider === 'paypal') {
          const result = unwrap(
            await browserApi.POST('/api/v1/payments/paypal/capture', { body: { token } }),
          );
          if (result.outcome === 'paid' || result.outcome === 'already_processed') {
            settle(result.order);
          } else {
            setState({
              kind: 'error',
              message:
                'Le paiement n’a pas pu être confirmé. Aucun montant n’est retenu sans confirmation : contactez-nous si votre compte a été débité.',
            });
          }
          return;
        }
        for (let attempt = 0; attempt < POLL_MAX && !cancelled; attempt += 1) {
          const order = await trackOrder(token);
          if (order.status !== 'pending_payment' || attempt === POLL_MAX - 1) {
            settle(order);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } catch (error) {
        if (!cancelled) setState({ kind: 'error', message: userMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, provider]);

  if (state.kind === 'waiting') {
    return (
      <div className={styles.attente}>
        <p role="status">Confirmation du paiement en cours…</p>
        <Skeleton height="8rem" radius="14px" />
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <ErrorState
        title="Le paiement n’a pas pu être confirmé"
        action={<ButtonLink href="/contact">Nous contacter</ButtonLink>}
      >
        <p>{state.message}</p>
      </ErrorState>
    );
  }
  if (state.kind === 'pending') {
    return (
      <div className={styles.page}>
        <FormStatus tone="succes">
          Votre paiement est en cours de confirmation par la banque. Vous recevrez un e-mail dès
          qu’il est validé (commande {state.order.reference}).
        </FormStatus>
        {token && <ButtonLink href={trackingHref(token)}>Suivre ma commande</ButtonLink>}
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <FormStatus tone="succes">
        Merci ! Votre paiement de {formatPrice(state.order.totalCents)} est confirmé. Un e-mail
        récapitulatif vous a été envoyé.
      </FormStatus>
      <OrderView order={state.order} getInvoiceUrl={invoiceFor(token!)} />
      <div className={styles.actions}>
        {state.order.shippingMethod === 'digital' && (
          <ButtonLink href="/espace-membre/formations" withArrow>
            Accéder à mes formations
          </ButtonLink>
        )}
        <ButtonLink href={trackingHref(token!)} variant="secondaire">
          Lien de suivi de la commande
        </ButtonLink>
        <ButtonLink href="/boutique" variant="discret">
          Revenir à la boutique
        </ButtonLink>
      </div>
    </div>
  );
}

/** Paiement abandonné : la commande reste réservée quelques minutes, on peut reprendre. */
export function PaymentCancelled() {
  const token = useUrlToken('suivi');
  const [order, setOrder] = useState<Order | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<'stripe' | 'paypal' | null>(null);

  useEffect(() => {
    if (!token) return;
    trackOrder(token).then(setOrder, (error: unknown) => setFailure(userMessage(error)));
  }, [token]);

  const retry = async (provider: 'stripe' | 'paypal') => {
    if (!token) return;
    setBusy(provider);
    setFailure(null);
    try {
      const payment = unwrap(
        await browserApi.POST('/api/v1/payments/checkout', { body: { token, provider } }),
      );
      window.location.assign(payment.redirectUrl);
    } catch (error) {
      setFailure(userMessage(error));
      setBusy(null);
    }
  };

  const until = order?.reservationExpiresAt
    ? new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      }).format(new Date(order.reservationExpiresAt))
    : null;

  return (
    <div className={styles.page}>
      <p>
        Aucun montant n’a été prélevé.
        {order?.status === 'pending_payment' && until
          ? ` Votre commande ${order.reference} reste réservée jusqu’à ${until} : vous pouvez reprendre le paiement.`
          : ''}
      </p>
      <FormStatus tone="erreur">{failure}</FormStatus>
      <div className={styles.actions}>
        {order?.status === 'pending_payment' && (
          <>
            <Button onClick={() => retry('stripe')} loading={busy === 'stripe'}>
              Payer par carte bancaire
            </Button>
            <Button
              variant="secondaire"
              onClick={() => retry('paypal')}
              loading={busy === 'paypal'}
            >
              Payer avec PayPal
            </Button>
          </>
        )}
        <ButtonLink href="/panier" variant="discret">
          Revenir au panier
        </ButtonLink>
      </div>
    </div>
  );
}

/** Suivi d'une commande par le lien signé reçu par e-mail (achat sans compte). */
export function OrderTracking() {
  const token = useUrlToken();
  const [order, setOrder] = useState<Order | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [kept, setKept] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // Le jeton reste en mémoire pour la facture ; il n'est plus dans la barre d'adresse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKept(token);
    trackOrder(token).then(setOrder, (error: unknown) => setFailure(userMessage(error)));
  }, [token]);

  if (token === null) {
    return (
      <ErrorState title="Ce lien de suivi est incomplet">
        <p>Ouvrez le lien reçu par e-mail tel quel.</p>
      </ErrorState>
    );
  }
  if (failure) {
    return (
      <ErrorState
        title="Cette commande est introuvable"
        action={<ButtonLink href="/contact">Nous contacter</ButtonLink>}
      >
        <p>{failure}</p>
      </ErrorState>
    );
  }
  if (!order || !kept) return <Skeleton height="16rem" radius="14px" />;
  return <OrderView order={order} getInvoiceUrl={invoiceFor(kept)} />;
}
