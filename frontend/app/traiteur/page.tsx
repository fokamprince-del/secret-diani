import type { Metadata } from 'next';
import { Conditions } from '@/components/catering/Conditions';
import { ProductCard } from '@/components/catering/ProductCard';
import { RequestForm } from '@/components/catering/RequestForm';
import { SelectionProvider } from '@/components/catering/SelectionProvider';
import { PageHeader } from '@/components/content/PageHeader';
import { Reviews } from '@/components/home/Reviews';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/States';
import { getCateringCatalog, getReviews } from '@/lib/api/content';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Traiteur & commandes',
  description:
    'Plateaux de mini bouchées, à la carte et layer cakes faits maison pour vos fêtes : choisissez, contactez Diani sur WhatsApp ou envoyez votre demande.',
  path: '/traiteur',
});

export default async function TraiteurPage() {
  const [catalog, reviews] = await Promise.all([getCateringCatalog(), getReviews(6)]);
  const categories = (catalog?.categories ?? []).filter((category) => category.products.length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Univers 01"
        title="Traiteur & commandes"
        intro={
          <p>
            Des plateaux qui disparaissent avant l’arrivée du dessert, des layer cakes à vos
            parfums. Vous me donnez la date et le nombre d’invités, je m’occupe du reste.
          </p>
        }
      />

      {!catalog ? (
        <div className="conteneur">
          <ErrorState title="Le catalogue est momentanément indisponible">
            <p>
              Revenez dans quelques minutes, ou écrivez-nous directement depuis la page Contact.
            </p>
          </ErrorState>
        </div>
      ) : (
        <SelectionProvider>
          {categories.length > 1 && (
            <nav aria-label="Rubriques du traiteur" className={`conteneur ${styles.rubriques}`}>
              <ul role="list">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <a href={`#${category.slug}`} className={`${styles.rubrique} sans-filet`}>
                      {category.name}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#demande" className={`${styles.rubrique} sans-filet`}>
                    Demande personnalisée
                  </a>
                </li>
              </ul>
            </nav>
          )}

          <div className={`conteneur ${styles.catalogue}`}>
            {categories.map((category) => (
              <section
                key={category.slug}
                id={category.slug}
                aria-labelledby={`${category.slug}-titre`}
                className={styles.categorie}
              >
                <div className={styles.entete}>
                  <h2 id={`${category.slug}-titre`}>{category.name}</h2>
                  {category.description && <p>{category.description}</p>}
                </div>
                <ul role="list" className={styles.grille} data-type={category.kind}>
                  {category.products.map((product) => (
                    <li key={product.id}>
                      <ProductCard product={product} kind={category.kind} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <Conditions conditions={catalog.conditions} />
          </div>

          <Reviews reviews={reviews} />

          <section
            id="demande"
            aria-labelledby="demande-titre"
            className={`conteneur ${styles.demande}`}
          >
            <div className={styles.demandeIntro}>
              <h2 id="demande-titre">Demande personnalisée</h2>
              <p>
                Un buffet complet, un gâteau sur mesure, une question ? Indiquez votre date et vos
                envies : je vous recontacte pour caler chaque détail.
              </p>
              {catalog.conditions.whatsappUrl && (
                <p>
                  Plus rapide :{' '}
                  <a
                    href={catalog.conditions.whatsappUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Icon name="whatsapp" size={18} className={styles.iconeLien} />
                    écrire sur WhatsApp
                    <span className="visually-hidden"> (nouvel onglet)</span>
                  </a>
                  .
                </p>
              )}
            </div>
            <RequestForm conditions={catalog.conditions} />
          </section>
        </SelectionProvider>
      )}
    </>
  );
}
