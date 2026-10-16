import { Icon, type IconName } from '../ui/Icon';
import styles from './Reassurance.module.css';

/** Engagements de la marque, vrais pour toutes les clientes (cahier des charges + maquette). */
const COMMITMENTS: { icon: IconName; label: string }[] = [
  { icon: 'panier', label: 'Produits frais et de qualité' },
  { icon: 'couverts', label: 'Fait maison, sur mesure' },
  { icon: 'ecran', label: 'Formations accessibles en ligne' },
  { icon: 'lock', label: 'Paiement sécurisé' },
  { icon: 'accompagnement', label: 'Accompagnement à l’écoute' },
];

/** Bande de réassurance, juste sous le hero : pictogrammes au trait fin, séparés d'un filet. */
export function Reassurance() {
  return (
    <section aria-labelledby="engagements-titre" className={styles.engagements}>
      <div className={`conteneur ${styles.bande}`}>
        <h2 id="engagements-titre" className="visually-hidden">
          Nos engagements
        </h2>
        <ul role="list" className={styles.liste} data-apparition="cascade">
          {COMMITMENTS.map((item) => (
            <li key={item.label} className={styles.item}>
              <Icon name={item.icon} size={30} className={styles.icone} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        <p className={styles.note} aria-hidden="true">
          La cuisine, une source d’opportunités ♡
        </p>
      </div>
    </section>
  );
}
