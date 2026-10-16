import type { CateringCatalog, Pack } from '@/lib/api/types';
import { Icon, type IconName } from '../ui/Icon';
import styles from './Chiffres.module.css';

interface Chiffre {
  icon: IconName;
  value: string;
  label: string;
}

/**
 * Citation et chiffres, d'après la maquette. Seulement des chiffres vrais, tirés du catalogue
 * (parfums, tailles de gâteau, packs) : aucun nombre de clientes n'est affiché tant que Diani
 * ne l'a pas fourni.
 */
export function Chiffres({
  catalog,
  packs,
}: {
  catalog: CateringCatalog | null;
  packs: Pack[] | null;
}) {
  const layerCake = catalog?.categories
    .filter((category) => category.kind === 'layer_cake')
    .flatMap((category) => category.products)[0];

  const chiffres: Chiffre[] = [
    layerCake && layerCake.flavours.length > 0
      ? { icon: 'heart', value: String(layerCake.flavours.length), label: 'Parfums de layer cake' }
      : null,
    layerCake && layerCake.variants.length > 1
      ? {
          icon: 'couverts',
          value: String(layerCake.variants.length),
          label: 'Tailles, du bento au buffet',
        }
      : null,
    packs && packs.length > 0
      ? { icon: 'ecran', value: String(packs.length), label: 'Packs de formation' }
      : null,
    { icon: 'star', value: '100 %', label: 'Fait maison, avec passion' },
  ].filter((chiffre): chiffre is Chiffre => chiffre !== null);

  return (
    <section aria-labelledby="chiffres-titre" className={styles.bande} data-bande-finale>
      <div className={`conteneur ${styles.grille}`}>
        <blockquote className={styles.citation}>
          <p id="chiffres-titre">
            Une meilleure version de vous
            <br />
            commence ici <span aria-hidden="true">♡</span>
          </p>
        </blockquote>
        <ul role="list" className={styles.liste} data-apparition="cascade">
          {chiffres.map((chiffre) => (
            <li key={chiffre.label} className={styles.chiffre}>
              <Icon name={chiffre.icon} size={26} className={styles.icone} />
              <strong className={styles.valeur}>{chiffre.value}</strong>
              <span className={styles.libelle}>{chiffre.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
