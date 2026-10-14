import type { HomeContent } from '@/lib/api/types';
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
        <figure className={styles.figure}>
          <blockquote className={styles.citation}>
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </blockquote>
          {word.signature && <figcaption className={styles.signature}>{word.signature}</figcaption>}
        </figure>
      </div>
    </section>
  );
}
