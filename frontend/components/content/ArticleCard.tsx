import Link from 'next/link';
import type { Ref } from 'react';
import type { ArticleCard as ArticleCardData } from '@/lib/api/types';
import { formatDate, formatReadingTime } from '@/lib/format';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import styles from './ArticleCard.module.css';

interface ArticleCardProps {
  article: ArticleCardData;
  /** Niveau du titre selon la page (h2 dans la liste, h3 dans « À lire aussi »). */
  headingLevel?: 2 | 3;
  /** Lien du titre, pour y placer le focus après « Afficher plus d’articles ». */
  linkRef?: Ref<HTMLAnchorElement>;
}

/**
 * Carte d'article : le titre porte le lien, la carte entière reste cliquable (zone étendue en
 * CSS) sans imbriquer de contenus interactifs dans un lien.
 */
export function ArticleCard({ article, headingLevel = 2, linkRef }: ArticleCardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className={styles.carte}>
      <div className={styles.visuel}>
        {article.cover ? (
          <ResponsiveImage
            image={article.cover}
            sizes="(min-width: 64rem) 360px, (min-width: 40rem) 45vw, 100vw"
            aspectRatio="3 / 2"
            zoomOnHover
          />
        ) : (
          <div className={styles.aplat} aria-hidden="true" />
        )}
      </div>
      <div className={styles.texte}>
        {article.category && <p className={styles.categorie}>{article.category.name}</p>}
        <Heading className={styles.titre}>
          <Link ref={linkRef} href={`/conseils/${article.slug}`} className={styles.lien}>
            {article.title}
          </Link>
        </Heading>
        <p className={styles.resume}>{article.excerpt}</p>
        <p className={styles.meta}>
          <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
          {' · '}
          {formatReadingTime(article.readingMinutes)}
        </p>
      </div>
    </article>
  );
}
