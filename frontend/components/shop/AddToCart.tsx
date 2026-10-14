'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import { CSRF, shopApi } from '@/lib/api/shop';
import type { ShopVariant } from '@/lib/api/types';
import { writeCartCount } from '@/lib/cart-hint';
import { formatPrice } from '@/lib/format';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { FormStatus } from '../ui/States';
import { availabilityLabel } from './AvailabilityBadge';
import styles from './AddToCart.module.css';

interface AddToCartProps {
  productName: string;
  variants: ShopVariant[];
  /** Boutique fermée dans l'administration : le catalogue reste visible, l'achat non. */
  shopOpen: boolean;
}

/**
 * Choix de la variante et de la quantité, puis « Ajouter au panier ». Le prix et le stock
 * affichés sont ceux de l'API ; c'est elle qui plafonne la quantité au stock disponible.
 */
export function AddToCart({ productName, variants, shopOpen }: AddToCartProps) {
  const uid = useId();
  const firstAvailable = variants.find((variant) => variant.availability.status !== 'out_of_stock');
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? variants[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const variant = variants.find((entry) => entry.id === variantId) ?? variants[0];
  if (!variant) return null;
  const soldOut = variant.availability.status === 'out_of_stock';
  const max = variant.availability.remaining ?? 10;

  const add = async () => {
    setBusy(true);
    setAdded(null);
    setFailure(null);
    try {
      const cart = unwrap(
        await shopApi.POST('/api/v1/shop/cart/items', {
          params: { header: CSRF },
          body: { variantId: variant.id, quantity },
        }),
      );
      writeCartCount(cart.itemCount);
      setAdded(
        `${productName}${variants.length > 1 ? ` (${variant.label})` : ''} ajouté au panier.`,
      );
    } catch (error) {
      setFailure(userMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.achat}>
      {variants.length > 1 && (
        <fieldset className={styles.groupe}>
          <legend className={styles.legende}>Choisissez</legend>
          <div className={styles.variantes}>
            {variants.map((entry) => (
              <label key={entry.id} className={styles.variante}>
                <input
                  type="radio"
                  name={`${uid}-variante`}
                  value={entry.id}
                  checked={entry.id === variant.id}
                  onChange={() => {
                    setVariantId(entry.id);
                    setQuantity(1);
                    setAdded(null);
                  }}
                />
                <span className={styles.varianteNom}>{entry.label}</span>
                <span className={styles.variantePrix}>
                  {formatPrice(entry.priceCents)} · {availabilityLabel(entry.availability)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <p className={styles.prix}>{formatPrice(variant.priceCents)}</p>

      {!shopOpen ? (
        <p className={styles.ferme}>
          La boutique est momentanément fermée : les commandes reprennent bientôt.
        </p>
      ) : soldOut ? (
        <p className={styles.ferme}>Épuisé pour le moment : revenez bientôt.</p>
      ) : (
        <div className={styles.ligne}>
          <div className={styles.quantite}>
            <label htmlFor={`${uid}-quantite`}>Quantité</label>
            <div className={styles.pas}>
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                disabled={quantity <= 1}
              >
                <span aria-hidden="true">−</span>
                <span className="visually-hidden">Retirer un</span>
              </button>
              <input
                id={`${uid}-quantite`}
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={quantity}
                onChange={(event) =>
                  setQuantity(
                    Math.max(1, Math.min(max, Math.round(Number(event.target.value)) || 1)),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.min(max, value + 1))}
                disabled={quantity >= max}
              >
                <span aria-hidden="true">+</span>
                <span className="visually-hidden">Ajouter un</span>
              </button>
            </div>
          </div>
          <Button onClick={add} loading={busy}>
            <Icon name="bag" size={20} />
            Ajouter au panier
          </Button>
        </div>
      )}

      <p role="status" className={styles.ajoute}>
        {added && (
          <>
            <Icon name="check" size={18} />
            <span>
              {added} <Link href="/panier">Voir le panier</Link>
            </span>
          </>
        )}
      </p>
      <FormStatus tone="erreur">{failure}</FormStatus>
    </div>
  );
}
