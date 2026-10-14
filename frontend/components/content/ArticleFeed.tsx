'use client';

import { useEffect, useRef, useState } from 'react';
import { browserApi, unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import type { ArticleCard as ArticleCardData } from '@/lib/api/types';
import { pluralize } from '@/lib/format';
import { Button } from '../ui/Button';
import { FormStatus } from '../ui/States';
import { ArticleCard } from './ArticleCard';
import styles from './ArticleFeed.module.css';

interface ArticleFeedProps {
  initialItems: ArticleCardData[];
  initialCursor: string | null;
  category?: string;
  pageSize: number;
}

/**
 * Liste des articles : la première page est rendue au build (statique, indexable), les
 * suivantes sont chargées à la demande. Le focus passe au premier article ajouté et le
 * nombre d'articles chargés est annoncé.
 */
export function ArticleFeed({ initialItems, initialCursor, category, pageSize }: ArticleFeedProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const firstNewLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (focusIndex !== null) firstNewLink.current?.focus();
  }, [focusIndex]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailure(null);
    try {
      const page = unwrap(
        await browserApi.GET('/api/v1/content/articles', {
          params: { query: { category, cursor, limit: pageSize } },
        }),
      );
      setFocusIndex(items.length);
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
      setAnnounce(`${pluralize(page.items.length, 'article ajouté', 'articles ajoutés')}.`);
    } catch (error) {
      setFailure(userMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.flux}>
      <ul role="list" className={styles.grille}>
        {items.map((article, index) => (
          <li key={article.id}>
            <ArticleCard
              article={article}
              linkRef={index === focusIndex ? firstNewLink : undefined}
            />
          </li>
        ))}
      </ul>
      <p className="visually-hidden" role="status">
        {announce}
      </p>
      <FormStatus tone="erreur">{failure}</FormStatus>
      {cursor && (
        <div className={styles.plus}>
          <Button variant="secondaire" onClick={loadMore} loading={loading}>
            Afficher plus d’articles
          </Button>
        </div>
      )}
    </div>
  );
}
