import type { TocEntry } from '@/lib/api/types';
import styles from './TableOfContents.module.css';

/** Sommaire des titres de niveau 2 et 3 (ancres générées par l'API). Masqué sous deux titres. */
export function TableOfContents({ entries }: { entries: TocEntry[] }) {
  if (entries.length < 2) return null;
  return (
    <nav aria-labelledby="sommaire-titre" className={styles.sommaire}>
      <h2 id="sommaire-titre" className={styles.titre}>
        Sommaire
      </h2>
      <ol role="list" className={styles.liste}>
        {entries.map((entry) => (
          <li key={entry.id} data-niveau={entry.level} className={styles.entree}>
            <a href={`#${entry.id}`}>{entry.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
