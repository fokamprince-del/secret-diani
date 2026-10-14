import type { ReactNode } from 'react';
import styles from './AuthCard.module.css';

/** Gabarit des pages de compte : une colonne étroite, un titre, le formulaire, des liens. */
export function AuthCard({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={`conteneur ${styles.page}`}>
      <div className={styles.carte}>
        <h1 className={styles.titre}>{title}</h1>
        {intro && <div className={styles.intro}>{intro}</div>}
        {children}
        {footer && <div className={styles.pied}>{footer}</div>}
      </div>
    </div>
  );
}
