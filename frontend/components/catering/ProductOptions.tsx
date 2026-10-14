'use client';

import { useId, useState } from 'react';
import type { CateringProduct } from '@/lib/api/types';
import { describeChoice, orderMessage, selectionKey, whatsappWithMessage } from '@/lib/catering';
import { formatPrice } from '@/lib/format';
import { Button, ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useSelection } from './SelectionProvider';
import styles from './ProductOptions.module.css';

type Props = Pick<
  CateringProduct,
  'id' | 'name' | 'variants' | 'flavours' | 'maxFlavours' | 'whatsappUrl'
>;

/**
 * Choix d'un produit traiteur : taille (avec son prix), parfums (layer cakes), puis
 * « Contacter » (WhatsApp, message pré-rempli avec le choix) ou « Ajouter à ma demande ».
 * Aucun paiement : Diani confirme et demande l'acompte ensuite.
 */
export function ProductOptions({ id, name, variants, flavours, maxFlavours, whatsappUrl }: Props) {
  const uid = useId();
  const { add } = useSelection();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [flavourIds, setFlavourIds] = useState<string[]>([]);
  const [added, setAdded] = useState<string | null>(null);

  const variant = variants.find((entry) => entry.id === variantId) ?? variants[0];
  if (!variant) return null;

  const chosenFlavours = flavours.filter((flavour) => flavourIds.includes(flavour.id));
  const flavourNames = chosenFlavours.map((flavour) => flavour.name);
  const choice = describeChoice(
    name,
    variants.length > 1 ? variant.label : undefined,
    flavourNames,
  );
  const whatsapp = whatsappWithMessage(whatsappUrl, orderMessage(choice));
  const full = maxFlavours > 0 && flavourIds.length >= maxFlavours;

  const toggleFlavour = (flavourId: string, checked: boolean) => {
    setAdded(null);
    setFlavourIds((current) =>
      checked ? [...current, flavourId] : current.filter((entry) => entry !== flavourId),
    );
  };

  const addToRequest = () => {
    add({
      key: selectionKey(variant.id, flavourIds),
      variantId: variant.id,
      productName: name,
      variantLabel: variant.label,
      priceCents: variant.priceCents,
      flavourIds,
      flavourNames,
    });
    setAdded(`${choice} : ajouté à votre demande.`);
  };

  return (
    <div className={styles.options}>
      {variants.length > 1 && (
        <fieldset className={styles.groupe}>
          <legend className={styles.legende}>Choisissez la taille</legend>
          <div className={styles.tailles}>
            {variants.map((entry) => (
              <label key={entry.id} className={styles.taille}>
                <input
                  type="radio"
                  name={`${uid}-taille`}
                  value={entry.id}
                  checked={entry.id === variant.id}
                  onChange={() => {
                    setVariantId(entry.id);
                    setAdded(null);
                  }}
                />
                <span className={styles.tailleLibelle}>{entry.label}</span>
                <span className={styles.taillePrix}>{formatPrice(entry.priceCents)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {maxFlavours > 0 && flavours.length > 0 && (
        <fieldset className={styles.groupe} aria-describedby={`${uid}-parfums-aide`}>
          <legend className={styles.legende}>Vos parfums</legend>
          <p id={`${uid}-parfums-aide`} className={styles.aide}>
            {maxFlavours > 1 ? `Jusqu’à ${maxFlavours} parfums au choix` : 'Un parfum au choix'}
            {flavourIds.length > 0 &&
              ` · ${flavourIds.length} choisi${flavourIds.length > 1 ? 's' : ''}`}
          </p>
          <div className={styles.parfums}>
            {flavours.map((flavour) => {
              const checked = flavourIds.includes(flavour.id);
              return (
                <label key={flavour.id} className={styles.parfum}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && full}
                    onChange={(event) => toggleFlavour(flavour.id, event.target.checked)}
                  />
                  <span>{flavour.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {variants.length > 1 && (
        <p className={styles.prix} aria-live="polite">
          <span className="visually-hidden">Prix pour la taille choisie : </span>
          {formatPrice(variant.priceCents)}
        </p>
      )}

      <div className={styles.actions}>
        {whatsapp ? (
          <a
            href={whatsapp}
            className={`${styles.contacter} sans-filet`}
            rel="noopener noreferrer"
            target="_blank"
            data-produit={id}
          >
            <Icon name="whatsapp" size={20} />
            Contacter
            <span className="visually-hidden">
              {' '}
              sur WhatsApp au sujet de : {choice} (nouvel onglet)
            </span>
          </a>
        ) : (
          <ButtonLink href="#demande">Contacter</ButtonLink>
        )}
        <Button variant="secondaire" onClick={addToRequest}>
          Ajouter à ma demande
        </Button>
      </div>
      <p role="status" className={styles.ajoute}>
        {added && (
          <>
            <Icon name="check" size={18} />
            <span>
              {added} <a href="#demande">Voir ma demande</a>
            </span>
          </>
        )}
      </p>
    </div>
  );
}
