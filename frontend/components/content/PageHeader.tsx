import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  /** Courte introduction sous le titre. */
  intro?: ReactNode;
  /** Ligne d'information au-dessus du titre (catégorie, rubrique). */
  eyebrow?: ReactNode;
  /** Informations sous l'introduction (date de mise à jour, temps de lecture). */
  meta?: ReactNode;
}

/** En-tête des pages intérieures : le seul `h1` de la page. */
export function PageHeader({ title, intro, eyebrow, meta }: PageHeaderProps) {
  return (
    <header className={`conteneur ${styles.entete}`}>
      {eyebrow && <p className={styles.surtitre}>{eyebrow}</p>}
      <h1 className={styles.titre}>{title}</h1>
      {intro && <div className={styles.intro}>{intro}</div>}
      {meta && <p className={styles.meta}>{meta}</p>}
    </header>
  );
}
