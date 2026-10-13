import Link from 'next/link';
import styles from './Logo.module.css';

/** Logo typographique : « Les Secrets de » + « Diani » manuscrit. */
export function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" className={`${styles.logo} sans-filet`} onClick={onNavigate}>
      <span className={styles.debut}>Les Secrets de</span>
      <span className={styles.nom}>Diani</span>
      <span className="visually-hidden">, retour à l’accueil</span>
    </Link>
  );
}
