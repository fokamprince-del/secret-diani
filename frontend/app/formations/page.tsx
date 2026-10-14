import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { CourseCard } from '@/components/courses/CourseCard';
import { PackCard } from '@/components/courses/PackCard';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/States';
import { getCourses, getPacks, getSiteSettings } from '@/lib/api/content';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Formations en ligne',
  description:
    'Apprenez la pâtisserie avec Diani : packs Essentiel, Intermédiaire et Premium, leçons vidéo, fiches PDF, quiz et certificat. Une leçon d’exemple offerte.',
  path: '/formations',
});

/** Fonctionnement de la plateforme (textes d'interface). */
const STEPS = [
  { title: 'Choisissez votre pack', text: 'Chaque pack inclut les contenus des packs précédents.' },
  {
    title: 'Créez votre compte et payez',
    text: 'Paiement sécurisé ; l’accès s’ouvre dès le paiement confirmé.',
  },
  {
    title: 'Apprenez à votre rythme',
    text: 'Vidéos, fiches PDF, quiz et reprise là où vous en étiez.',
  },
  {
    title: 'Obtenez votre certificat',
    text: 'À la fin de chaque formation, un certificat vérifiable.',
  },
];

export default async function FormationsPage() {
  const [packs, courses, settings] = await Promise.all([
    getPacks(),
    getCourses(),
    getSiteSettings(),
  ]);
  const salesOpen = settings?.features.courseSalesOpen ?? true;
  const featured = (courses ?? []).filter((course) => course.featured);
  const sortedPacks = [...(packs ?? [])].sort((a, b) => a.rank - b.rank);
  const topRank = sortedPacks.at(-1)?.rank;

  return (
    <>
      <PageHeader
        eyebrow="Univers 02"
        title="Formations en ligne"
        intro={
          <p>
            Les techniques de Diani, en vidéo et pas à pas : crème au beurre, chantilly brésilienne,
            organisation d’une commande, vente sur les réseaux.
          </p>
        }
      />
      <div className={`conteneur ${styles.page}`}>
        {!packs || !courses ? (
          <ErrorState title="Les formations sont momentanément indisponibles">
            <p>Revenez dans quelques minutes.</p>
          </ErrorState>
        ) : (
          <>
            <section aria-labelledby="packs-titre" className={styles.section}>
              <h2 id="packs-titre">Les packs</h2>
              {!salesOpen && (
                <p className={styles.alerte}>
                  Les inscriptions sont momentanément fermées. Les formations déjà achetées restent
                  accessibles.
                </p>
              )}
              <ul role="list" className={styles.packs}>
                {sortedPacks.map((pack) => (
                  <li key={pack.id}>
                    <PackCard
                      pack={pack}
                      salesOpen={salesOpen}
                      highlighted={pack.rank === topRank}
                    />
                  </li>
                ))}
              </ul>
            </section>

            {featured.length > 0 && (
              <section aria-labelledby="phares-titre" className={styles.section}>
                <h2 id="phares-titre">Les formations phares</h2>
                <ul role="list" className={styles.formations}>
                  {featured.map((course) => (
                    <li key={course.id}>
                      <CourseCard course={course} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="exemple-titre" className={styles.exemple}>
              <div>
                <h2 id="exemple-titre">Essayez avant de choisir</h2>
                <p>
                  Une leçon complète est offerte, sans compte : vidéo, conseils et fiche. Vous
                  verrez exactement comment se passe une formation.
                </p>
              </div>
              <ButtonLink
                href={`/formations/${featured[0]?.slug ?? courses[0]?.slug ?? ''}`}
                withArrow
              >
                Voir la leçon d’exemple
              </ButtonLink>
            </section>

            <section aria-labelledby="fonctionnement-titre" className={styles.section}>
              <h2 id="fonctionnement-titre">Comment ça marche</h2>
              <ol className={styles.etapes}>
                {STEPS.map((step, index) => (
                  <li key={step.title} className={styles.etape}>
                    <span className={styles.numero} aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className={styles.etapeTitre}>{step.title}</h3>
                    <p>{step.text}</p>
                  </li>
                ))}
              </ol>
              <p className={styles.compte}>
                <Icon name="user" size={18} /> Un compte est nécessaire pour suivre les formations :
                votre progression et vos certificats y sont gardés.
              </p>
            </section>
          </>
        )}
      </div>
    </>
  );
}
