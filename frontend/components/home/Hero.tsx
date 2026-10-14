import type { ReactNode } from 'react';
import { ButtonLink } from '../ui/Button';
import { CremeTrait } from '../ui/CremeTrait';
import styles from './Hero.module.css';

interface HeroProps {
  /** Visuel d'ambiance culinaire (jamais un portrait). Absent : fond uni crème et sable. */
  media?: ReactNode;
}

/**
 * Hero de l'accueil : titre fort, trait de crème, sous-texte, un seul bouton.
 * Entrée échelonnée en CSS (aucun JavaScript), visible d'emblée si le mouvement est réduit :
 * le titre glisse, le trait se dessine dessous comme à la poche à douille, puis le reste suit.
 */
export function Hero({ media }: HeroProps) {
  return (
    <section className={styles.hero} aria-labelledby="hero-titre">
      {media && <div className={styles.media}>{media}</div>}
      <div className={`conteneur ${styles.contenu}`}>
        <h1 id="hero-titre" className={styles.titre}>
          Bien plus qu’une cuisine, une histoire de partage.
        </h1>
        <CremeTrait variant="titre" mouvement="chargement" className={styles.trait} />
        <p className={styles.texte}>
          Traiteur, formations et boutique d’accessoires pour créer, apprendre et se faire plaisir.
        </p>
        <div className={styles.action}>
          <ButtonLink href="#univers" withArrow>
            Découvrir nos univers
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
