import { Icon } from './Icon';
import styles from './Rating.module.css';

const formatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/**
 * Note sur 5 : étoiles décoratives, valeur lue en clair par les lecteurs d'écran
 * (« Note : 4,8 sur 5 »). La couleur n'est jamais seule à porter l'information.
 */
export function Rating({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <span className={styles.note}>
      <span className={styles.etoiles} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Icon
            key={star}
            name="star"
            size={18}
            className={star <= filled ? styles.pleine : styles.vide}
          />
        ))}
      </span>
      <span className="visually-hidden">Note : {formatter.format(value)} sur 5</span>
    </span>
  );
}
