import Link from 'next/link';
import styles from './Logo.module.css';

/** Toque de chef au trait fin, posée au-dessus du nom (même famille que les pictogrammes). */
function Toque() {
  return (
    <svg className={styles.toque} viewBox="0 0 40 36" aria-hidden="true" focusable="false">
      <path d="M11 27c-5.5-1-8.5-5.2-7.4-9.6C4.8 12.6 9.6 10 14 11.6 15.4 6.6 19 4 22.6 4.4c4 .4 6.8 3.6 6.9 7.4 4.6-1.6 9 1.4 9.2 6 .2 4.4-2.8 8.3-8.2 9.2" />
      <path d="M11 27h19.5l-1 5.6H12z" />
      <path d="M15.4 27.2l-.8-6M20.7 27.2v-6.6M26 27.2l.8-6" />
    </svg>
  );
}

/**
 * Logo : « Les / Secrets / de Diani » sur trois lignes, toque au trait et, en grand format,
 * la signature « Cuisine • Formation • Inspiration ».
 */
export function Logo({
  onNavigate,
  size = 'compact',
}: {
  onNavigate?: () => void;
  /** `grand` : pied de page, avec la signature. */
  size?: 'compact' | 'grand';
}) {
  return (
    <Link href="/" className={`${styles.logo} sans-filet`} data-taille={size} onClick={onNavigate}>
      <span className={styles.marque}>
        <span className={styles.les}>Les</span>
        <Toque />
        <span className={styles.secrets}>Secrets</span>
        <span className={styles.diani}>
          <em>de</em> Diani
        </span>
      </span>
      {size === 'grand' && (
        <span className={styles.signature}>Cuisine • Formation • Inspiration</span>
      )}
      <span className="visually-hidden">, retour à l’accueil</span>
    </Link>
  );
}
