import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { Logo } from './Logo';
import { MainNav } from './MainNav';
import { MobileMenu } from './MobileMenu';
import styles from './Header.module.css';

/**
 * En-tête collant. Le panier et l'espace membre n'apparaissent que lorsqu'ils servent :
 * badge de quantité (phase 5) et état connecté (phase 4). En attendant, un lien de connexion.
 */
export function Header() {
  return (
    <header className={styles.entete}>
      <div className={`conteneur ${styles.barre}`}>
        <Logo />
        <MainNav />
        <div className={styles.actions}>
          <Link href="/connexion" className={`${styles.action} sans-filet`}>
            <Icon name="user" />
            <span className="visually-hidden">Se connecter</span>
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
