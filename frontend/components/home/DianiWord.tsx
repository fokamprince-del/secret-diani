import type { HomeContent } from '@/lib/api/types';
import { CremeTrait } from '../ui/CremeTrait';
import styles from './DianiWord.module.css';

/** Le mot de Diani, saisi dans l'administration ; texte vide : section masquée. */
export function DianiWord({ word }: { word: HomeContent['dianiWord'] | null | undefined }) {
  if (!word?.text) return null;
  const paragraphs = word.text.split(/\n+/).filter((line) => line.trim());
  return (
    <section aria-labelledby="mot-titre" className={styles.mot}>
      <div className={`conteneur ${styles.contenu}`}>
        <h2 id="mot-titre" className={styles.titre}>
          Le mot de Diani
        </h2>
        <figure className={styles.figure} data-apparition="monte">
          <blockquote className={styles.citation}>
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </blockquote>
          {word.signature && (
            <figcaption className={styles.signature}>
              {word.signature}
              <CremeTrait mouvement="apparition" className={styles.trait} />
            </figcaption>
          )}
        </figure>
      </div>
    </section>
  );
}
