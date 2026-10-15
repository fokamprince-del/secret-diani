import type { ReactNode } from 'react';
import { CremeTrait } from '../ui/CremeTrait';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  /** Courte introduction sous le titre. */
  intro?: ReactNode;
  /** Ligne d'information au-dessus du titre (catégorie, rubrique). */
  eyebrow?: ReactNode;
  /** Informations sous l'introduction (date de mise à jour, temps de lecture). */
  meta?: ReactNode;
  /** Couleur de saveur de la tache décorative (traiteur : mangue, formations : framboise…). */
  accent?: 'mangue' | 'framboise' | 'caramel';
}

/**
 * En-tête des pages intérieures : le seul `h1` de la page, souligné du trait de crème qui se
 * dessine, avec une tache couleur saveur qui ondule derrière (décor).
 */
export function PageHeader({ title, intro, eyebrow, meta, accent = 'mangue' }: PageHeaderProps) {
  return (
    <header className={`conteneur ${styles.entete}`} data-accent={accent}>
      <span className={styles.tache} aria-hidden="true" />
      {eyebrow && (
        <p className={styles.surtitre}>
          <CremeTrait variant="puce" />
          {eyebrow}
        </p>
      )}
      <h1 className={styles.titre}>{title}</h1>
      <CremeTrait mouvement="chargement" className={styles.trait} />
      {intro && <div className={styles.intro}>{intro}</div>}
      {meta && <p className={styles.meta}>{meta}</p>}
    </header>
  );
}
