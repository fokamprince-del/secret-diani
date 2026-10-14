import type { Metadata } from 'next';
import Link from 'next/link';
import { permanentRedirect } from 'next/navigation';
import { ArticleCard } from '@/components/content/ArticleCard';
import { PageHeader } from '@/components/content/PageHeader';
import { RichText } from '@/components/content/RichText';
import { TableOfContents } from '@/components/content/TableOfContents';
import { ButtonLink } from '@/components/ui/Button';
import { JsonLd } from '@/components/ui/JsonLd';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { ErrorState } from '@/components/ui/States';
import { getArticle, getArticles } from '@/lib/api/content';
import { formatDate, formatReadingTime } from '@/lib/format';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

type Params = Promise<{ slug: string }>;

/** Les articles récents sont générés au build ; les autres à la première visite (puis en cache). */
export const dynamicParams = true;

export async function generateStaticParams() {
  const articles = await getArticles();
  return (articles?.items ?? []).map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const article = await getArticle((await params).slug);
  if (!article) return { title: 'Article momentanément indisponible' };
  return pageMetadata({
    title: article.seo.title,
    description: article.seo.description,
    path: `/conseils/${article.slug}`,
    type: 'article',
    image: article.cover
      ? {
          url: article.cover.url,
          width: article.cover.width,
          height: article.cover.height,
          alt: article.cover.alt,
        }
      : null,
  });
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    return (
      <div className="conteneur">
        <ErrorState
          title="Cet article est momentanément indisponible"
          headingLevel={1}
          action={<ButtonLink href="/conseils">Voir tous les conseils</ButtonLink>}
        >
          <p>Il sera de retour dans quelques minutes.</p>
        </ErrorState>
      </div>
    );
  }
  // Ancienne adresse : l'API a suivi la redirection, on redirige aussi le visiteur (301).
  if (article.slug !== slug) permanentRedirect(`/conseils/${article.slug}`);

  return (
    <>
      <JsonLd data={article.jsonLd} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Conseils & astuces', path: '/conseils' },
          ...(article.category
            ? [
                {
                  name: article.category.name,
                  path: `/conseils/categorie/${article.category.slug}`,
                },
              ]
            : []),
          { name: article.title, path: `/conseils/${article.slug}` },
        ])}
      />
      <article>
        <PageHeader
          eyebrow={
            article.category ? (
              <Link href={`/conseils/categorie/${article.category.slug}`}>
                {article.category.name}
              </Link>
            ) : (
              'Conseils & astuces'
            )
          }
          title={article.title}
          intro={<p>{article.excerpt}</p>}
          meta={
            <>
              <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
              {' · '}
              {formatReadingTime(article.readingMinutes)}
            </>
          }
        />
        {article.cover && (
          <div className={`conteneur ${styles.couverture}`}>
            <ResponsiveImage
              image={article.cover}
              sizes="(min-width: 75rem) 1180px, calc(100vw - 2 * var(--gouttiere))"
              aspectRatio="16 / 9"
              priority
            />
          </div>
        )}
        <div className={`conteneur ${styles.corps}`}>
          <TableOfContents entries={article.toc} />
          <RichText html={article.bodyHtml} />
        </div>
      </article>

      {article.relatedCourseSlug && (
        <aside aria-labelledby="formation-titre" className={`conteneur ${styles.formation}`}>
          <div className={styles.formationCadre}>
            <h2 id="formation-titre" className={styles.formationTitre}>
              Aller plus loin avec Diani
            </h2>
            <p>Cette technique est enseignée pas à pas, en vidéo, dans les formations en ligne.</p>
            <div>
              <ButtonLink href="/formations" withArrow>
                Découvrir les formations
              </ButtonLink>
            </div>
          </div>
        </aside>
      )}

      {article.relatedArticles.length > 0 && (
        <section aria-labelledby="lire-aussi" className={`conteneur ${styles.associes}`}>
          <h2 id="lire-aussi" className={styles.associesTitre}>
            À lire aussi
          </h2>
          <ul role="list" className={styles.grille}>
            {article.relatedArticles.slice(0, 3).map((related) => (
              <li key={related.id}>
                <ArticleCard article={related} headingLevel={3} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
