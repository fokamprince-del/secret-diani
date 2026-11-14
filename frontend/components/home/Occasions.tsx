import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  BUFFET_BURGERS,
  BUFFET_PHOTO,
  COURONNE_DOREE,
  MANGUE_PASSION,
  type Photo,
} from '@/lib/vitrine';
import { CremeTrait } from '../ui/CremeTrait';
import { Icon } from '../ui/Icon';
import { StaticPhoto } from '../ui/StaticPhoto';
import styles from './Occasions.module.css';

interface Occasion {
  value: 'wedding' | 'birthday' | 'baptism' | 'corporate';
  title: string;
  text: string;
  photo: Photo;
  /** Saveur qui teinte la carte (jetons de couleur des gâteaux). */
  accent: string;
  /** Photo d'ambiance (buffet) plutôt que gâteau détouré. */
  ambiance?: boolean;
}

const OCCASIONS: Occasion[] = [
  {
    value: 'wedding',
    title: 'Mariage',
    text: 'Vin d’honneur, buffet salé et pièce montée en layer cake, à la mesure de votre grand jour.',
    photo: BUFFET_PHOTO,
    accent: 'var(--or)',
    ambiance: true,
  },
  {
    value: 'birthday',
    title: 'Anniversaire',
    text: 'Un gâteau à son image, ses parfums préférés, et des bouchées pour tous les invités.',
    photo: COURONNE_DOREE,
    accent: 'var(--framboise)',
  },
  {
    value: 'baptism',
    title: 'Baptême & famille',
    text: 'Des douceurs claires et délicates, des plateaux à partager pour réunir tout le monde.',
    photo: MANGUE_PASSION,
    accent: 'var(--caramel)',
  },
  {
    value: 'corporate',
    title: 'Entreprise',
    text: 'Pauses gourmandes, séminaires, inaugurations : mini burgers, wraps et verrines prêts à servir.',
    photo: BUFFET_BURGERS,
    accent: 'var(--ganache)',
    ambiance: true,
  },
];

/**
 * « Pour quelle occasion ? » : quatre portes d'entrée vers le devis traiteur, l'occasion déjà
 * choisie dans le formulaire. Chaque carte prend la couleur d'une saveur ; le gâteau flotte
 * et s'approche au survol (immobile si le mouvement est réduit).
 */
export function Occasions() {
  return (
    <section aria-labelledby="occasions-titre" className={styles.occasions}>
      <div className="conteneur">
        <div className={styles.entete}>
          <p className={styles.surtitre}>Traiteur & pâtisserie sur mesure</p>
          <h2 id="occasions-titre">Pour quelle occasion ?</h2>
          <CremeTrait mouvement="apparition" />
        </div>
        <ul role="list" className={styles.grille}>
          {OCCASIONS.map((occasion, index) => (
            <li
              key={occasion.value}
              data-apparition="monte"
              style={{ '--accent': occasion.accent, '--i': index } as CSSProperties}
            >
              <Link
                href={`/traiteur?occasion=${occasion.value}#demande`}
                className={`${styles.carte} sans-filet`}
                data-ambiance={occasion.ambiance || undefined}
              >
                <span className={styles.visuel} aria-hidden="true">
                  <span
                    className={occasion.ambiance ? styles.photoAmbiance : `${styles.gateau} studio`}
                  >
                    <StaticPhoto
                      photo={occasion.photo}
                      sizes="(min-width: 64rem) 300px, 60vw"
                      focus="50% 50%"
                      decorative
                    />
                  </span>
                </span>
                <span className={styles.texte}>
                  <span className={styles.titre}>{occasion.title}</span>
                  <span className={styles.description}>{occasion.text}</span>
                  <span className={styles.action}>
                    Demander un devis
                    <Icon name="arrowRight" size={18} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
