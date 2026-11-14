'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { adminNavigation } from '@/lib/admin/navigation';
import { endSession } from '@/lib/auth/session';
import { useAuth } from '../auth/AuthProvider';
import { QueryProvider } from '../providers/QueryProvider';
import { Icon } from '../ui/Icon';
import { ToastProvider } from './kit';
import styles from './AdminShell.module.css';

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  if (href === '/admin/formations') {
    return pathname === href || /^\/admin\/formations\/(?!packs|appels)/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Gabarit du back-office : réservé aux comptes administrateurs (l'API refuse de toute façon
 * tout jeton sans rôle admin ni double authentification). Navigation latérale sur ordinateur,
 * tiroir sur téléphone.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/connexion?retour=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (status !== 'authenticated') {
    return (
      <div className={styles.attente} data-espace-admin aria-busy="true">
        <span className={styles.spinner} aria-hidden="true" />
        <p role="status">Ouverture de l’administration…</p>
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className={styles.attente} data-espace-admin>
        <h1 className={styles.refusTitre}>Espace réservé</h1>
        <p>Cette partie du site est réservée à l’équipe des Secrets de Diani.</p>
        <Link href="/">Revenir au site</Link>
      </div>
    );
  }

  return (
    <QueryProvider>
      <ToastProvider>
        <div className={styles.espace} data-espace-admin data-menu-ouvert={open || undefined}>
          <header className={styles.barreMobile}>
            <button
              type="button"
              className={styles.burger}
              aria-expanded={open}
              aria-controls="admin-navigation"
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name={open ? 'close' : 'menu'} size={22} />
              <span className="visually-hidden">Menu de l’administration</span>
            </button>
            <Link href="/admin" className={`${styles.marqueMobile} sans-filet`}>
              Les Secrets de Diani
            </Link>
          </header>

          <aside id="admin-navigation" className={styles.cote}>
            <Link href="/admin" className={`${styles.marque} sans-filet`}>
              <span className={styles.marqueNom}>Les Secrets</span>
              <span className={styles.marqueDiani}>de Diani</span>
              <span className={styles.marqueRole}>Administration</span>
            </Link>
            <nav aria-label="Administration" className={styles.navigation}>
              {adminNavigation.map((section) => (
                <div key={section.title} className={styles.section}>
                  <p className={styles.sectionTitre}>{section.title}</p>
                  <ul role="list">
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className={`${styles.lien} sans-filet`}
                          aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}
                          onClick={() => setOpen(false)}
                        >
                          <Icon name={link.icon} size={19} />
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className={styles.pied}>
              <p className={styles.compte}>
                <span className={styles.avatar} aria-hidden="true">
                  {(user.firstName || user.email).slice(0, 1).toUpperCase()}
                </span>
                <span className={styles.compteNom}>{user.firstName || user.email}</span>
              </p>
              <Link href="/" className={`${styles.lienPied} sans-filet`} target="_blank">
                <Icon name="externe" size={17} />
                Voir le site
              </Link>
              <button
                type="button"
                className={styles.lienPied}
                onClick={async () => {
                  await endSession();
                  router.replace('/');
                }}
              >
                <Icon name="logout" size={17} />
                Se déconnecter
              </button>
            </div>
          </aside>
          <button
            type="button"
            className={styles.voile}
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />

          <div className={styles.contenu}>{children}</div>
        </div>
      </ToastProvider>
    </QueryProvider>
  );
}
