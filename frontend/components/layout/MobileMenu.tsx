'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Icon } from '../ui/Icon';
import { Logo } from './Logo';
import type { SocialLink } from '@/lib/social';
import { isCurrent, mainNavigation } from './navigation';
import styles from './MobileMenu.module.css';

/**
 * Menu plein écran (mobile). `<dialog>` modal natif : le reste de la page devient inerte
 * (piège de focus), Échap ferme le menu et le focus revient sur le bouton d'ouverture.
 */
export function MobileMenu({ social }: { social: SocialLink | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const { status } = useAuth();
  const connected = status === 'authenticated';

  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  // Changement de page (bouton précédent, lien interne) : le menu se referme.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className={styles.ouvrir}
        onClick={open}
        aria-haspopup="dialog"
        aria-controls="menu-mobile"
      >
        <Icon name="menu" />
        <span className="visually-hidden">Ouvrir le menu</span>
      </button>

      <dialog id="menu-mobile" ref={dialogRef} className={styles.menu} aria-label="Menu">
        <div className={`conteneur ${styles.haut}`}>
          <Logo onNavigate={close} />
          <button type="button" className={styles.fermer} onClick={close}>
            <Icon name="close" />
            <span className="visually-hidden">Fermer le menu</span>
          </button>
        </div>

        <nav aria-label="Navigation principale" className={`conteneur ${styles.nav}`}>
          <ul role="list">
            {mainNavigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.lien} sans-filet`}
                  aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                  onClick={close}
                >
                  <span className={styles.icone} aria-hidden="true">
                    <Icon name={item.icon} size={20} />
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={`conteneur ${styles.bas}`}>
          <Link
            href={connected ? '/espace-membre' : '/connexion'}
            className={`${styles.secondaire} sans-filet`}
            onClick={close}
          >
            <Icon name="user" size={20} />
            {connected ? 'Mon espace' : 'Se connecter'}
          </Link>
          {social && (
            <a
              href={social.href}
              className={`${styles.secondaire} sans-filet`}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Icon name={social.network} size={20} />
              {social.handle}
              <span className="visually-hidden"> sur {social.label} (nouvel onglet)</span>
            </a>
          )}
        </div>
      </dialog>
    </>
  );
}
