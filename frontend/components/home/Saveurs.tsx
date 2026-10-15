import { SAVEURS } from '@/lib/vitrine';
import { Drip } from '../ui/Drip';
import styles from './Saveurs.module.css';

function Liste({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul role="list" className={styles.liste} aria-hidden={hidden || undefined}>
      {SAVEURS.map((saveur, index) => (
        <li key={saveur} className={styles.saveur} data-ton={index % 3}>
          {saveur}
        </li>
      ))}
    </ul>
  );
}

/**
 * Bandeau des saveurs, couleur ganache, qui défile doucement (pause au survol, immobile si le
 * mouvement est réduit) et coule en drip sur la section suivante. La liste est dupliquée pour
 * une boucle sans à-coup ; le double est masqué des lecteurs d'écran.
 */
export function Saveurs() {
  return (
    <section className={styles.bandeau} aria-label="Au menu">
      <div className={styles.piste}>
        <Liste />
        <Liste hidden />
      </div>
      <Drip color="var(--ganache)" />
    </section>
  );
}
