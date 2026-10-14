'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { onCartCountChange, readCartCount } from '@/lib/cart-hint';
import { pluralize } from '@/lib/format';
import { Icon } from '../ui/Icon';
import styles from './CartLink.module.css';

/** Panier de l'en-tête : affiché seulement s'il contient quelque chose, avec le nombre d'articles. */
export function CartLink({ className }: { className?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(readCartCount());
    update();
    return onCartCountChange(update);
  }, []);

  if (count === 0) return null;
  return (
    <Link href="/panier" className={`${className ?? ''} ${styles.panier}`}>
      <Icon name="bag" />
      <span className={styles.badge} aria-hidden="true">
        {count > 99 ? '99+' : count}
      </span>
      <span className="visually-hidden">Panier, {pluralize(count, 'article', 'articles')}</span>
    </Link>
  );
}
