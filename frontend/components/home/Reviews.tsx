import type { ReviewList } from '@/lib/api/types';
import { formatDate, pluralize } from '@/lib/format';
import { Rating } from '../ui/Rating';
import styles from './Reviews.module.css';

const averageFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Avis clients du traiteur, modérés dans l'administration (jamais inventés). Grille sur grand
 * écran, liste défilante au doigt sur mobile (zone focalisable : défilement au clavier).
 * Aucun avis publié : la section n'est pas affichée.
 */
export function Reviews({ reviews }: { reviews: ReviewList | null }) {
  if (!reviews || reviews.items.length === 0) return null;
  return (
    <section aria-labelledby="avis-titre" className={styles.avis}>
      <div className={`conteneur ${styles.entete}`}>
        <h2 id="avis-titre">Ce qu’en disent nos clients</h2>
        {reviews.average !== null && (
          <p className={styles.moyenne}>
            <Rating value={reviews.average} />
            <span>
              {averageFormatter.format(reviews.average)} sur 5, d’après{' '}
              {pluralize(reviews.count, 'avis', 'avis')} sur le traiteur
            </span>
          </p>
        )}
      </div>
      <div className={`conteneur ${styles.defilement}`} tabIndex={0} aria-labelledby="avis-titre">
        <ul role="list" className={styles.liste}>
          {reviews.items.map((review) => (
            <li key={review.id} className={styles.carte}>
              <figure className={styles.figure}>
                <Rating value={review.rating} />
                <blockquote className={styles.citation}>
                  <p>{review.content}</p>
                </blockquote>
                <figcaption className={styles.auteur}>
                  <span className={styles.nom}>{review.authorName}</span>
                  <span className={styles.details}>
                    {[review.occasion, formatDate(review.receivedOn)].filter(Boolean).join(' · ')}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
