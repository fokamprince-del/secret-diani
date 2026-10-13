'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isCurrent, mainNavigation } from './navigation';
import styles from './Header.module.css';

/** Navigation horizontale (écrans larges). Le lien de la section courante est signalé. */
export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className={styles.nav}>
      <ul role="list" className={styles.liens}>
        {mainNavigation.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.lien}
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
