'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import { type Cart as CartData, CSRF, shopApi } from '@/lib/api/shop';
import type { CartLine } from '@/lib/api/types';
import { writeCartCount } from '@/lib/cart-hint';
import { formatPrice } from '@/lib/format';
import { Button, ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { EmptyState, ErrorState, FormStatus, Skeleton } from '../ui/States';
import { AvailabilityBadge } from './AvailabilityBadge';
import styles from './Cart.module.css';

const ISSUES: Record<NonNullable<CartLine['issue']>, string> = {
  unavailable: 'Ce produit n’est plus disponible : retirez-le pour commander.',
  insufficient_stock: 'Stock insuffisant pour cette quantité : réduisez-la pour commander.',
};

/**
 * Panier : quantités modifiables, tous les montants calculés par l'API. Les frais de
 * livraison sont choisis à l'étape suivante (selon l'adresse) ; une estimation est donnée ici.
 */
export function Cart() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (data: CartData) => {
    setCart(data);
    writeCartCount(data.itemCount);
  };

  const fetchCart = useCallback(
    () =>
      shopApi
        .GET('/api/v1/shop/cart', { params: { query: { country: 'FR' } } })
        .then(unwrap)
        .then(
          (data) => {
            setCart(data);
            writeCartCount(data.itemCount);
          },
          (error: unknown) => setLoadError(userMessage(error)),
        ),
    [],
  );

  useEffect(() => {
    void fetchCart();
  }, [fetchCart]);

  const load = () => {
    setLoadError(null);
    void fetchCart();
  };

  const update = async (line: CartLine, quantity: number) => {
    setPending(line.variantId);
    setFailure(null);
    setNotice(null);
    try {
      const data =
        quantity <= 0
          ? unwrap(
              await shopApi.DELETE('/api/v1/shop/cart/items/{variantId}', {
                params: { path: { variantId: line.variantId }, header: CSRF },
              }),
            )
          : unwrap(
              await shopApi.PATCH('/api/v1/shop/cart/items/{variantId}', {
                params: { path: { variantId: line.variantId }, header: CSRF },
                body: { quantity },
              }),
            );
      apply(data);
      if (quantity <= 0) setNotice(`${line.productName} retiré du panier.`);
    } catch (error) {
      setFailure(userMessage(error));
    } finally {
      setPending(null);
    }
  };

  if (loadError) {
    return (
      <ErrorState
        title="Votre panier n’a pas pu être chargé"
        action={<Button onClick={load}>Réessayer</Button>}
      >
        <p>{loadError}</p>
      </ErrorState>
    );
  }
  if (!cart) {
    return (
      <div className={styles.chargement} aria-busy="true">
        <Skeleton height="7rem" radius="14px" />
        <Skeleton height="7rem" radius="14px" />
      </div>
    );
  }
  if (cart.items.length === 0) {
    return (
      <>
        <FormStatus tone="succes">{notice}</FormStatus>
        <EmptyState
          title="Votre panier est vide… pour l’instant."
          icon="bag"
          action={<ButtonLink href="/boutique">Je choisis mon kit</ButtonLink>}
        >
          <p>Les kits sont prêts, il ne manque plus que vous.</p>
        </EmptyState>
      </>
    );
  }

  const cheapestDelivery = cart.shippingOptions
    .filter((option) => option.method === 'delivery')
    .sort((a, b) => a.priceCents - b.priceCents)[0];

  return (
    <div className={styles.panier}>
      <section aria-labelledby="articles-titre" className={styles.articles}>
        <h2 id="articles-titre" className="visually-hidden">
          Articles
        </h2>
        <ul role="list" className={styles.lignes}>
          {cart.items.map((line) => (
            <li
              key={line.variantId}
              className={styles.ligne}
              aria-busy={pending === line.variantId}
            >
              <div className={styles.aplat} aria-hidden="true">
                <Icon name="bag" size={28} />
              </div>
              <div className={styles.produit}>
                <Link href={`/boutique/${line.productSlug}`} className={styles.nom}>
                  {line.productName}
                </Link>
                <p className={styles.detail}>
                  {line.variantLabel} · {formatPrice(line.unitPriceCents)} l’unité
                </p>
                <AvailabilityBadge availability={line.availability} />
                {line.issue && <p className={styles.probleme}>{ISSUES[line.issue]}</p>}
              </div>
              <div className={styles.quantite}>
                <label htmlFor={`quantite-${line.variantId}`} className="visually-hidden">
                  Quantité de {line.productName}
                </label>
                <select
                  id={`quantite-${line.variantId}`}
                  value={line.quantity}
                  disabled={pending !== null}
                  onChange={(event) => update(line, Number(event.target.value))}
                >
                  {Array.from(
                    { length: Math.max(line.maxQuantity, line.quantity) },
                    (_, index) => index + 1,
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.retirer}
                  disabled={pending !== null}
                  onClick={() => update(line, 0)}
                >
                  Retirer<span className="visually-hidden"> {line.productName}</span>
                </button>
              </div>
              <p className={styles.total}>{formatPrice(line.lineTotalCents)}</p>
            </li>
          ))}
        </ul>
        <FormStatus tone="succes">{notice}</FormStatus>
        <FormStatus tone="erreur">{failure}</FormStatus>
      </section>

      <aside aria-labelledby="recap-titre" className={styles.recap}>
        <h2 id="recap-titre" className={styles.recapTitre}>
          Récapitulatif
        </h2>
        <dl className={styles.montants}>
          <div>
            <dt>Sous-total</dt>
            <dd>{formatPrice(cart.subtotalCents)}</dd>
          </div>
          <div>
            <dt>Livraison</dt>
            <dd>
              {cheapestDelivery
                ? cheapestDelivery.free
                  ? 'Offerte'
                  : `à partir de ${formatPrice(cheapestDelivery.priceCents)}`
                : 'Calculée à l’étape suivante'}
            </dd>
          </div>
        </dl>
        {cart.pickupDetails && (
          <p className={styles.retrait}>
            <Icon name="pin" size={18} /> Retrait possible : {cart.pickupDetails}
          </p>
        )}
        {cart.checkoutReady ? (
          <ButtonLink href="/commande" withArrow fullWidth>
            Commander
          </ButtonLink>
        ) : (
          <p className={styles.probleme}>Corrigez les articles signalés pour commander.</p>
        )}
        <p className={styles.mention}>
          <Icon name="lock" size={16} /> Paiement sécurisé par Stripe ou PayPal. Compte facultatif.
        </p>
      </aside>
    </div>
  );
}
