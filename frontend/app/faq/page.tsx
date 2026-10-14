import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { RichText } from '@/components/content/RichText';
import { Accordion } from '@/components/ui/Accordion';
import { ButtonLink } from '@/components/ui/Button';
import { JsonLd } from '@/components/ui/JsonLd';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { getFaq } from '@/lib/api/content';
import type { FaqItem } from '@/lib/api/types';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Questions fréquentes',
  description:
    'Livraison, paiement, accès aux formations, kits, retours et commandes traiteur : les réponses aux questions les plus posées.',
  path: '/faq',
});

/** Rubriques dans l'ordre d'affichage (libellés d'interface ; les questions viennent de l'API). */
const CATEGORIES: { key: FaqItem['category']; label: string }[] = [
  { key: 'traiteur', label: 'Traiteur et commandes' },
  { key: 'formations', label: 'Formations' },
  { key: 'boutique', label: 'Boutique et kits' },
  { key: 'livraison', label: 'Livraison' },
  { key: 'paiement', label: 'Paiement' },
  { key: 'retours', label: 'Retours et remboursements' },
  { key: 'general', label: 'Questions générales' },
];

export default async function FaqPage() {
  const faq = await getFaq();
  const groups = CATEGORIES.map((category) => ({
    ...category,
    items: (faq?.items ?? []).filter((item) => item.category === category.key),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <JsonLd data={faq?.jsonLd} />
      <PageHeader
        title="Questions fréquentes"
        intro={<p>Les réponses aux questions que l’on nous pose le plus souvent.</p>}
      />
      <div className={`conteneur ${styles.faq}`}>
        {!faq ? (
          <ErrorState title="Les questions sont momentanément indisponibles">
            <p>Revenez dans quelques minutes, ou posez directement votre question.</p>
          </ErrorState>
        ) : groups.length === 0 ? (
          <EmptyState title="Aucune question pour le moment">
            <p>Posez-nous directement votre question : nous y répondrons avec plaisir.</p>
          </EmptyState>
        ) : (
          <>
            {groups.length > 1 && (
              <nav aria-label="Rubriques de la FAQ" className={styles.rubriques}>
                <ul role="list">
                  {groups.map((group) => (
                    <li key={group.key}>
                      <a href={`#${group.key}`} className={`${styles.rubrique} sans-filet`}>
                        {group.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            {groups.map((group) => (
              <section
                key={group.key}
                id={group.key}
                aria-labelledby={`${group.key}-titre`}
                className={styles.groupe}
              >
                <h2 id={`${group.key}-titre`} className={styles.titre}>
                  {group.label}
                </h2>
                <Accordion
                  items={group.items.map((item) => ({
                    id: `question-${item.id}`,
                    title: item.question,
                    content: <RichText html={item.answerHtml} />,
                  }))}
                />
              </section>
            ))}
          </>
        )}

        <aside aria-labelledby="faq-contact" className={styles.contact}>
          <h2 id="faq-contact" className={styles.titre}>
            Vous ne trouvez pas votre réponse ?
          </h2>
          <p>Écrivez-nous, nous vous répondrons avec plaisir.</p>
          <div>
            <ButtonLink href="/contact" withArrow>
              Poser ma question
            </ButtonLink>
          </div>
        </aside>
      </div>
    </>
  );
}
