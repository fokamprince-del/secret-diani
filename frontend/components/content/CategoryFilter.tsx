import Link from 'next/link';
import type { ArticleCategory } from '@/lib/api/types';
import styles from './CategoryFilter.module.css';

/**
 * Filtre des conseils par catégorie : de vrais liens (une adresse par catégorie, indexable,
 * page statique), la catégorie courante signalée par `aria-current`.
 */
export function CategoryFilter({
  categories,
  current,
}: {
  categories: ArticleCategory[];
  current?: string;
}) {
  if (categories.length === 0) return null;
  const items = [
    { slug: undefined, name: 'Tous les conseils', href: '/conseils' },
    ...categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      href: `/conseils/categorie/${category.slug}`,
    })),
  ];
  return (
    <nav aria-label="Catégories de conseils" className={styles.filtre}>
      <ul role="list" className={styles.liste}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`${styles.pastille} sans-filet`}
              aria-current={item.slug === current ? 'page' : undefined}
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
