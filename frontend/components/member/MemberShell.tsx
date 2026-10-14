'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { endSession } from '@/lib/auth/session';
import { useAuth } from '../auth/AuthProvider';
import { QueryProvider } from '../providers/QueryProvider';
import { Icon } from '../ui/Icon';
import { Skeleton } from '../ui/States';
import { memberNavigation } from './navigation';
import styles from './MemberShell.module.css';

/**
 * Gabarit de l'espace membre : navigation, garde de connexion (redirection vers la connexion
 * avec retour, y compris quand la session se termine dans un autre onglet) et TanStack Query
 * pour les données du compte. Rien n'est affiché avant que la session soit confirmée.
 */
export function MemberShell({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(leaving ? '/' : `/connexion?retour=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname, leaving]);

  const logout = async () => {
    setLeaving(true);
    await endSession();
  };

  if (status !== 'authenticated') {
    return (
      <div className={`conteneur ${styles.chargement}`} aria-busy="true">
        <p className="visually-hidden" role="status">
          Ouverture de votre espace…
        </p>
        <Skeleton width="40%" height="2.5rem" />
        <Skeleton height="10rem" radius="14px" />
      </div>
    );
  }

  return (
    <QueryProvider>
      <div className={`conteneur ${styles.espace}`}>
        <nav aria-label="Mon espace" className={styles.navigation}>
          <p className={styles.bonjour}>
            Bonjour <strong>{user?.firstName || 'à vous'}</strong>
          </p>
          <ul role="list" className={styles.liens}>
            {memberNavigation.map((item) => {
              const current =
                item.href === '/espace-membre'
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.lien} sans-filet`}
                    aria-current={current ? 'page' : undefined}
                  >
                    <Icon name={item.icon} size={20} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <button type="button" className={styles.lien} onClick={logout}>
                <Icon name="logout" size={20} />
                Se déconnecter
              </button>
            </li>
          </ul>
        </nav>
        <div className={styles.contenu}>{children}</div>
      </div>
    </QueryProvider>
  );
}
