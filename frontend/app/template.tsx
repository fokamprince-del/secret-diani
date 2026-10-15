import type { ReactNode } from 'react';
import styles from './template.module.css';

/**
 * Remonté à chaque navigation (contrairement au layout) : chaque page entre en fondu glissé.
 * Opacité de départ non nulle, pour que le LCP reste mesuré dès le premier affichage ; aucun
 * état conservé après l'animation (`backwards`), pour ne pas gêner les éléments `fixed`.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}
