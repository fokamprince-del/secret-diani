import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { RichText } from '@/components/content/RichText';
import { ComparisonTable } from '@/components/shop/ComparisonTable';
import { ProductCard } from '@/components/shop/ProductCard';
import { Accordion } from '@/components/ui/Accordion';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { getFaq, getKitComparison, getShopProducts } from '@/lib/api/content';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Boutique & kits',
  description:
    'Les kits d’accessoires de pâtisserie choisis par Diani (Débutant, Expert, Pro Atelier) et les accessoires à l’unité. Livraison ou retrait, compte facultatif.',
  path: '/boutique',
});

export default async function BoutiquePage() {
  const [products, comparison, faq] = await Promise.all([
    getShopProducts(),
    getKitComparison(),
    getFaq(),
  ]);
  const kits = (products ?? []).filter((product) => product.kind === 'kit');
  const accessories = (products ?? []).filter((product) => product.kind === 'accessory');
  const questions = (faq?.items ?? []).filter((item) =>
    ['boutique', 'livraison', 'retours', 'paiement'].includes(item.category),
  );

  return (
    <>
      <PageHeader
        eyebrow="Univers 03"
        title="Boutique & kits"
        intro={
          <p>
            Les accessoires que j’utilise vraiment, réunis en kits selon votre niveau. Pas besoin de
            compte : un e-mail suffit pour suivre votre commande.
          </p>
        }
      />
      <div className={`conteneur ${styles.boutique}`}>
        {!products ? (
          <ErrorState title="La boutique est momentanément indisponible">
            <p>Revenez dans quelques minutes : les kits seront de retour.</p>
          </ErrorState>
        ) : products.length === 0 ? (
          <EmptyState
            title="Les kits arrivent bientôt"
            action={<ButtonLink href="/formations">Découvrir les formations</ButtonLink>}
          >
            <p>En attendant, mes formations vous attendent.</p>
          </EmptyState>
        ) : (
          <>
            {kits.length > 0 && (
              <section aria-labelledby="kits-titre" className={styles.section}>
                <h2 id="kits-titre">Les kits</h2>
                <ul role="list" className={styles.grille}>
                  {kits.map((product) => (
                    <li key={product.id}>
                      <ProductCard product={product} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {comparison && (
              <section aria-labelledby="comparer-titre" className={styles.section}>
                <h2 id="comparer-titre">Comparer les kits</h2>
                <ComparisonTable comparison={comparison} />
              </section>
            )}
            {accessories.length > 0 && (
              <section aria-labelledby="accessoires-titre" className={styles.section}>
                <h2 id="accessoires-titre">Accessoires à l’unité</h2>
                <ul role="list" className={styles.grille}>
                  {accessories.map((product) => (
                    <li key={product.id}>
                      <ProductCard product={product} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {questions.length > 0 && (
          <section aria-labelledby="questions-titre" className={styles.section}>
            <h2 id="questions-titre">Vos questions</h2>
            <div className={styles.faq}>
              <Accordion
                items={questions.map((item) => ({
                  id: `boutique-question-${item.id}`,
                  title: item.question,
                  content: <RichText html={item.answerHtml} />,
                }))}
              />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
