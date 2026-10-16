import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { BUFFET_VIDEO } from '@/lib/vitrine';
import { ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { LoopVideo } from '../ui/LoopVideo';
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
 * actions (commander, se former) et un grand visuel qui se fond dans le crème. Entrée échelonnée
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
            Les Secrets <span>de Diani</span>
          </h1>
          <p className={styles.promesse}>Cuisiner aujourd’hui, réussir demain.</p>
          <p className={styles.texte}>
            Des plats savoureux, des formations pratiques et des conseils pour faire de votre
            passion un véritable projet.
          </p>
          <div className={styles.actions}>
            <ButtonLink href="/traiteur" withArrow>
              Commander maintenant
            </ButtonLink>
            <ButtonLink href="/formations" variant="secondaire" className={styles.formations}>
              <span className={styles.lecture} aria-hidden="true">
                <Icon name="play" size={14} />
              </span>
              Découvrir les formations
            </ButtonLink>
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
