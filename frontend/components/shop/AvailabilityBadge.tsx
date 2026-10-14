import type { Availability } from '@/lib/api/types';
import { Icon } from '../ui/Icon';
import styles from './AvailabilityBadge.module.css';

/** Disponibilité en mots (jamais par la seule couleur) : « En stock », « Plus que 2 », « Épuisé ». */
export function availabilityLabel(availability: Availability): string {
  if (availability.status === 'out_of_stock') return 'Épuisé pour le moment';
  if (availability.status === 'low_stock' && availability.remaining !== null) {
    return `Plus que ${availability.remaining} en stock`;
  }
  return 'En stock';
}

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  return (
    <p className={styles.dispo} data-statut={availability.status}>
      <Icon name={availability.status === 'out_of_stock' ? 'close' : 'check'} size={16} />
      {availabilityLabel(availability)}
    </p>
  );
}
