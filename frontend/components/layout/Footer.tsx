import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { Logo } from './Logo';
import { ManageCookiesButton } from './ManageCookiesButton';
import { footerNavigation, socialLinks } from './navigation';
import styles from './Footer.module.css';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.pied}>
      <div className={`conteneur ${styles.grille}`}>
        <div className={styles.marque}>
          <Logo />
          <p className={styles.accroche}>
            Traiteur, formations et boutique d’accessoires pour créer, apprendre et se faire
            plaisir.
          </p>
          <a
            href={socialLinks.instagram.href}
            className={`${styles.reseau} sans-filet`}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon name="instagram" size={20} />
            {socialLinks.instagram.handle}
            <span className="visually-hidden"> sur Instagram (nouvel onglet)</span>
          </a>
        </div>

        <nav aria-labelledby="pied-univers" className={styles.colonne}>
          <h2 id="pied-univers" className={styles.titre}>
            Nos univers
          </h2>
          <ul role="list">
            {footerNavigation.univers.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.lien}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="pied-maison" className={styles.colonne}>
          <h2 id="pied-maison" className={styles.titre}>
            La maison
          </h2>
          <ul role="list">
            {footerNavigation.maison.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.lien}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={`conteneur ${styles.legal}`}>
        <p>© {year} Les Secrets de Diani</p>
        <nav aria-label="Informations légales">
          <ul role="list" className={styles.liensLegaux}>
            {footerNavigation.legal.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.lien}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <ManageCookiesButton />
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
