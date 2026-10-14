import type { CateringConditions } from '@/lib/api/types';
import { pluralize } from '@/lib/format';
import { Icon } from '../ui/Icon';
import styles from './Conditions.module.css';

/**
 * Conditions de commande, telles que réglées dans l'administration (la phrase sur l'acompte
 * est générée par l'API à partir des montants : elle ne peut pas les contredire).
 */
export function Conditions({ conditions }: { conditions: CateringConditions }) {
  return (
    <section id="conditions" aria-labelledby="conditions-titre" className={styles.conditions}>
      <h2 id="conditions-titre" className={styles.titre}>
        Comment commander
      </h2>
      <ol className={styles.etapes}>
        <li>
          <strong>Vous choisissez</strong> et nous contactez par WhatsApp ou par le formulaire de
          demande, au moins {pluralize(conditions.minNoticeDays, 'jour', 'jours')} avant votre
          événement.
        </li>
        <li>
          <strong>Diani confirme</strong> les disponibilités, le détail et le prix.
        </li>
        <li>
          <strong>Vous versez l’acompte</strong> : la commande est alors validée.
        </li>
      </ol>
      <ul role="list" className={styles.liste}>
        {conditions.items.map((item) => (
          <li key={item} className={styles.condition}>
            <Icon name="check" size={20} className={styles.icone} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
