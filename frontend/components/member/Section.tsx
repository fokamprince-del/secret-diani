import type { ReactNode } from 'react';
import styles from './Section.module.css';

/** Bloc d'une page de l'espace membre : titre de niveau 2, texte d'aide, contenu. */
export function MemberSection({
  id,
  title,
  intro,
  children,
  tone,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  tone?: 'danger';
}) {
  return (
    <section aria-labelledby={id} className={styles.section} data-ton={tone}>
      <h2 id={id} className={styles.titre}>
        {title}
      </h2>
      {intro && <div className={styles.intro}>{intro}</div>}
      {children}
    </section>
  );
}
