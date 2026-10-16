import type { SocialLink } from '@/lib/social';
import { AccountLink } from '../auth/AccountLink';
import { CartLink } from '../shop/CartLink';
import { Logo } from './Logo';
import { MainNav } from './MainNav';
import { MobileMenu } from './MobileMenu';
import styles from './Header.module.css';

/**
 * En-tête collant. Le panier et l'espace membre n'apparaissent que lorsqu'ils servent :
 * badge de quantité (panier) et état connecté (« Mon espace » au lieu de « Se connecter »).
 */
export function Header({ social }: { social: SocialLink | null }) {
  return (
    <header className={styles.entete}>
      <div className={`conteneur ${styles.barre}`}>
        <Logo />
        <MainNav />
        <div className={styles.actions}>
          <AccountLink className={`${styles.action} ${styles.compteIcone} sans-filet`} />
          <AccountLink withLabel className={`${styles.compte} sans-filet`} />
          <CartLink className={`${styles.action} sans-filet`} />
          <MobileMenu social={social} />
        </div>
      </div>
    </header>
  );
}
