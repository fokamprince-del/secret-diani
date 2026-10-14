import { ArticleFeed } from '@/components/content/ArticleFeed';
import { CategoryFilter } from '@/components/content/CategoryFilter';
import { PageHeader } from '@/components/content/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { ARTICLES_PER_PAGE, getArticleCategories, getArticles } from '@/lib/api/content';
import type { ArticleCategory } from '@/lib/api/types';

interface ConseilsIndexProps {
  /** Catégorie filtrée ; absente : tous les conseils. */
  category?: ArticleCategory;
}

/** Liste des conseils (toutes catégories ou une seule), commune aux deux adresses. */
export async function ConseilsIndex({ category }: ConseilsIndexProps) {
  const [articles, categories] = await Promise.all([
    getArticles(category?.slug),
    getArticleCategories(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={category ? 'Conseils & astuces' : undefined}
        title={category ? category.name : 'Conseils & astuces'}
        intro={
          <p>
            {category?.description ||
              'Recettes, techniques et organisation : les secrets de Diani pour réussir vos gâteaux et vos buffets.'}
          </p>
        }
      />
      <div className="conteneur">
        <CategoryFilter categories={categories ?? []} current={category?.slug} />
        {!articles ? (
          <ErrorState title="Les articles sont momentanément indisponibles">
            <p>Revenez dans quelques minutes : ils seront de retour.</p>
          </ErrorState>
        ) : articles.items.length === 0 ? (
          <EmptyState
            title="Les premiers conseils arrivent bientôt"
            action={<ButtonLink href="/formations">Découvrir les formations</ButtonLink>}
          >
            <p>En attendant, les formations de Diani vous guident pas à pas.</p>
          </EmptyState>
        ) : (
          <ArticleFeed
            key={category?.slug ?? 'tous'}
            initialItems={articles.items}
            initialCursor={articles.nextCursor}
            category={category?.slug}
            pageSize={ARTICLES_PER_PAGE}
          />
        )}
      </div>
    </>
  );
}
