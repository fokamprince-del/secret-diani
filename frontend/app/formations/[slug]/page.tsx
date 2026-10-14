import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/content/PageHeader';
import { RichText } from '@/components/content/RichText';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { JsonLd } from '@/components/ui/JsonLd';
import { ErrorState } from '@/components/ui/States';
import { getCourse, getCourses, getSiteSettings } from '@/lib/api/content';
import { formatDuration, formatPrice, pluralize } from '@/lib/format';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

type Params = Promise<{ slug: string }>;

export const dynamicParams = true;

export async function generateStaticParams() {
  const courses = await getCourses();
  return (courses ?? []).map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await getCourse((await params).slug);
  if (!course) return { title: 'Formation momentanément indisponible' };
  return pageMetadata({
    title: course.seo.title,
    description: course.seo.description,
    path: `/formations/${course.slug}`,
    image: course.cover
      ? {
          url: course.cover.url,
          width: course.cover.width,
          height: course.cover.height,
          alt: course.cover.alt,
        }
      : null,
  });
}

export default async function CoursePage({ params }: { params: Params }) {
  const { slug } = await params;
  const [course, settings] = await Promise.all([getCourse(slug), getSiteSettings()]);

  if (!course) {
    return (
      <div className="conteneur">
        <ErrorState
          title="Cette formation est momentanément indisponible"
          headingLevel={1}
          action={<ButtonLink href="/formations">Voir les formations</ButtonLink>}
        />
      </div>
    );
  }

  const salesOpen = settings?.features.courseSalesOpen ?? true;
  const preview = course.modules
    .flatMap((module) => module.lessons)
    .find((lesson) => lesson.freePreview);

  return (
    <>
      <JsonLd data={course.jsonLd} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Formations', path: '/formations' },
          { name: course.title, path: `/formations/${course.slug}` },
        ])}
      />
      <PageHeader
        eyebrow={<Link href="/formations">Formations</Link>}
        title={course.title}
        intro={<p>{course.summary}</p>}
        meta={`${pluralize(course.lessonCount, 'leçon', 'leçons')} · ${formatDuration(course.durationMinutes)} de vidéo · fiches PDF et quiz`}
      />
      <div className={`conteneur ${styles.fiche}`}>
        <div className={styles.contenu}>
          {course.descriptionHtml && <RichText html={course.descriptionHtml} />}

          <section aria-labelledby="programme-titre" className={styles.programme}>
            <h2 id="programme-titre">Programme</h2>
            {course.modules.map((module) => (
              <div key={module.id} className={styles.module}>
                <h3 className={styles.moduleTitre}>{module.title}</h3>
                <ol className={styles.lecons}>
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id} className={styles.lecon}>
                      <Icon
                        name={lesson.freePreview ? 'play' : 'lock'}
                        size={20}
                        className={styles.icone}
                      />
                      <span className={styles.leconTitre}>
                        {lesson.freePreview ? (
                          <Link href={`/formations/${course.slug}/${lesson.slug}`}>
                            {lesson.title}
                          </Link>
                        ) : (
                          lesson.title
                        )}
                        {lesson.freePreview && <span className={styles.badge}>Leçon offerte</span>}
                        {lesson.hasQuiz && <span className={styles.badge}>Quiz</span>}
                      </span>
                      {lesson.durationSeconds !== null && (
                        <span className={styles.duree}>
                          {formatDuration(lesson.durationSeconds / 60)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        </div>

        <aside aria-labelledby="acces-titre" className={styles.acces}>
          <h2 id="acces-titre" className={styles.accesTitre}>
            Inclus dans le pack {course.pack.name}
          </h2>
          <p className={styles.prix}>{formatPrice(course.pack.priceCents)}</p>
          <p className={styles.aide}>
            Et dans tous les packs supérieurs. Accès après paiement, avec votre compte.
          </p>
          {salesOpen ? (
            <ButtonLink href={`/commande/pack/${course.pack.slug}`} fullWidth>
              Choisir le pack {course.pack.name}
            </ButtonLink>
          ) : (
            <p className={styles.aide}>Les inscriptions rouvrent bientôt.</p>
          )}
          {preview && (
            <ButtonLink
              href={`/formations/${course.slug}/${preview.slug}`}
              variant="secondaire"
              fullWidth
            >
              Voir la leçon offerte
            </ButtonLink>
          )}
          <p className={styles.aide}>
            Vous avez déjà ce pack ? <Link href="/espace-membre/formations">Mes formations</Link>
          </p>
        </aside>
      </div>
    </>
  );
}
