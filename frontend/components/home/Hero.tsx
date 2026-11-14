import type { CSSProperties, ReactNode } from 'react';
import { preload } from 'react-dom';
import { BUFFET_VIDEO } from '@/lib/vitrine';
import { ButtonLink } from '../ui/Button';
import { LoopVideo } from '../ui/LoopVideo';
import { Magnetique } from '../ui/Magnetique';
import styles from './Hero.module.css';

interface HeroProps {
  /**
   * Visuel saisi dans l'administration (portrait de Diani en cuisine, ou photo d'ambiance), qui
   * se fond dans le décor à droite. Sans lui, la vidéo du buffet prend sa place.
   */
  media?: ReactNode;
}

/**
 * Hero de l'accueil, d'après la maquette : le nom de la marque en grand, la promesse, deux
 * actions (devis traiteur, carte) et un grand visuel qui se fond dans le crème. Entrée échelonnée
 * en CSS, immobile si le mouvement est réduit.
 */
export function Hero({ media }: HeroProps) {
  if (!media) preload(BUFFET_VIDEO.poster, { as: 'image', fetchPriority: 'high' });

  return (
    <section className={styles.hero} aria-labelledby="hero-titre">
      <div className={styles.visuel}>
        {media ?? (
          <>
            <LoopVideo
              src={BUFFET_VIDEO.video}
              poster={BUFFET_VIDEO.poster}
              focus={BUFFET_VIDEO.focus}
            />
            <span className="visually-hidden">{BUFFET_VIDEO.caption}</span>
          </>
        )}
      </div>

      <div className={`conteneur ${styles.grille}`}>
        <div className={styles.contenu}>
          <p className={styles.note} aria-hidden="true">
            Plus qu’une cuisine,
            <br />
            un art de vivre ♡
          </p>
          <h1 id="hero-titre" className={styles.titre}>
            {/* Révélation typographique : chaque mot sort de sa ligne, comme d'un moule. */}
            <span className={styles.ligne}>
              <span className={styles.mot} style={{ '--i': 0 } as CSSProperties}>
                Les
              </span>{' '}
              <span className={styles.mot} style={{ '--i': 1 } as CSSProperties}>
                Secrets
              </span>
            </span>{' '}
            <span className={`${styles.ligne} ${styles.ligneDiani}`}>
              <span className={styles.mot} style={{ '--i': 2 } as CSSProperties}>
                de
              </span>{' '}
              <span className={styles.mot} style={{ '--i': 3 } as CSSProperties}>
                Diani
              </span>
            </span>
          </h1>
          <p className={styles.promesse}>Traiteur et pâtisserie faits maison pour vos fêtes.</p>
          <p className={styles.texte}>
            Buffets salés, plateaux à partager et layer cakes sur mesure pour vos mariages,
            anniversaires, baptêmes et événements d’entreprise. Dites-moi la date et le nombre
            d’invités : je vous réponds avec une proposition.
          </p>
          <div className={styles.actions}>
            <Magnetique>
              <ButtonLink href="/traiteur#demande" withArrow>
                Demander un devis
              </ButtonLink>
            </Magnetique>
            <Magnetique>
              <ButtonLink href="/traiteur" variant="secondaire" className={styles.secondaire}>
                Voir la carte du traiteur
              </ButtonLink>
            </Magnetique>
          </div>
        </div>
      </div>

      <p className={styles.devise} aria-hidden="true">
        Good
        <br />
        food
        <br />
        good
        <br />
        mood
        <span>♡</span>
      </p>
    </section>
  );
}
