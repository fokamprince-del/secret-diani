import Link from 'next/link';
import type { CourseCard as CourseCardData } from '@/lib/api/types';
import { formatDuration, pluralize } from '@/lib/format';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import styles from './CourseCard.module.css';

/** Carte d'une formation : la carte entière mène à sa fiche (programme, pack requis). */
export function CourseCard({
  course,
  headingLevel = 3,
}: {
  course: CourseCardData;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className={styles.carte}>
      <div className={styles.visuel}>
        {course.cover ? (
          <ResponsiveImage
            image={course.cover}
            sizes="(min-width: 64rem) 360px, (min-width: 40rem) 45vw, 100vw"
            aspectRatio="4 / 5"
            zoomOnHover
          />
        ) : (
          <div className={styles.aplat} aria-hidden="true" />
        )}
      </div>
      <p className={styles.pack}>Pack {course.pack.name}</p>
      <Heading className={styles.titre}>
        <Link href={`/formations/${course.slug}`} className={styles.lien}>
          {course.title}
        </Link>
      </Heading>
      <p className={styles.resume}>{course.summary}</p>
      <p className={styles.meta}>
        {pluralize(course.lessonCount, 'leçon', 'leçons')} ·{' '}
        {formatDuration(course.durationMinutes)} de vidéo
      </p>
    </article>
  );
}
