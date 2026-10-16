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
import { COURONNE, CREATIONS } from '@/lib/vitrine';

const FRAMBOISES = CREATIONS.find((creation) => creation.slug === 'framboises')!;

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
        accent="framboise"
        eyebrow="Univers 02"
        title="Formations en ligne"
        intro={
          <p>
            Je vous montre le geste, vous le refaites chez vous. Crème au beurre, chantilly
            brésilienne, organisation d’une commande, vente sur les réseaux : tout est filmé pas à
            pas.
          </p>
        }
        visual={{
          video: FRAMBOISES.video,
          poster: FRAMBOISES.poster,
          focus: FRAMBOISES.focus,
          caption: `Layer cake ${FRAMBOISES.title.toLowerCase()} : ${FRAMBOISES.caption}`,
          medaillon: { src: COURONNE.fallback, alt: COURONNE.alt, focus: '50% 70%' },
          note: 'à vous de jouer !',
        }}
        points={[
          { icon: 'play', label: 'Vidéos pas à pas' },
          { icon: 'download', label: 'Fiches à télécharger' },
          { icon: 'star', label: 'Certificat à la fin' },
        ]}
      />
      <div className={`conteneur ${styles.page}`}>
        {!packs || !courses ? (
          <ErrorState title="Les formations sont momentanément indisponibles">
            <p>Revenez dans quelques minutes.</p>
          </ErrorState>
        ) : (
          <>
            <section aria-labelledby="packs-titre" className={styles.section}>
              <h2 id="packs-titre" data-apparition="flou">
                Les packs
              </h2>
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

            <section aria-labelledby="exemple-titre" className={styles.exemple} data-scene>
              <div>
                <h2 id="exemple-titre">Essayez avant de choisir</h2>
                <p>
                  Une leçon complète vous est offerte, sans compte : regardez comment j’explique
                  avant de choisir votre pack.
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
              <ol className={styles.etapes} data-apparition="cascade">
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
