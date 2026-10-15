import type { ReactNode } from 'react';
import { preload } from 'react-dom';
import { BUFFET_VIDEO, HERO_CREATION } from '@/lib/vitrine';
import { ButtonLink } from '../ui/Button';
import { CremeTrait } from '../ui/CremeTrait';
import { Icon, type IconName } from '../ui/Icon';
import { LoopVideo } from '../ui/LoopVideo';
import styles from './Hero.module.css';

interface HeroProps {
  /** Visuel d'ambiance saisi dans l'administration (jamais un portrait), en plein fond. */
  media?: ReactNode;
}

/** Engagements vrais quelles que soient les conditions réglées dans l'administration. */
const PROMESSES: { icon: IconName; label: string }[] = [
  { icon: 'heart', label: 'Fait maison' },
  { icon: 'leaf', label: 'Préparé pour votre date' },
  { icon: 'lock', label: 'Paiement sécurisé' },
];

/**
 * Hero de l'accueil : titre fort, trait de crème, sous-texte, un seul bouton.
 * Entrée échelonnée en CSS, visible d'emblée si le mouvement est réduit : le titre glisse, le
 * trait se dessine dessous comme à la poche à douille, puis le reste suit.
 *
 * Sans visuel saisi dans l'administration, la vitrine prend le relais et montre les deux
 * métiers d'un coup d'œil : le buffet salé filmé sous une arche de cloche, et un gâteau de
 * Diani en médaillon.
 */
export function Hero({ media }: HeroProps) {
  if (!media) preload(BUFFET_VIDEO.poster, { as: 'image', fetchPriority: 'high' });

  return (
    <section
      className={[styles.hero, !media && styles.vitrine].filter(Boolean).join(' ')}
      aria-labelledby="hero-titre"
    >
      {media && <div className={styles.media}>{media}</div>}
      <div className={`conteneur ${styles.grille}`}>
        <div className={styles.contenu}>
          <p className={styles.surtitre}>
            <CremeTrait variant="puce" />
            Traiteur · Pâtisserie · Formations
          </p>
          <h1 id="hero-titre" className={styles.titre}>
            Bien plus qu’une cuisine, une histoire de partage.
          </h1>
          <CremeTrait variant="titre" mouvement="chargement" className={styles.trait} />
          <p className={styles.texte}>
            Traiteur, formations et boutique d’accessoires pour créer, apprendre et se faire
            plaisir.
          </p>
          <div className={styles.action}>
            <ButtonLink href="#univers" withArrow>
              Découvrir nos univers
            </ButtonLink>
          </div>
          <ul role="list" className={styles.promesses}>
            {PROMESSES.map((item) => (
              <li key={item.label}>
                <Icon name={item.icon} size={18} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        {!media && (
          <div className={styles.scene}>
            <span className={styles.halo} aria-hidden="true" />
            <figure className={styles.arche}>
              <LoopVideo
                src={BUFFET_VIDEO.video}
                poster={BUFFET_VIDEO.poster}
                focus={BUFFET_VIDEO.focus}
              />
              <figcaption className="visually-hidden">{BUFFET_VIDEO.caption}</figcaption>
            </figure>
            <figure className={styles.medaillon}>
              <picture>
                {/* Affiche fixe : une seule vidéo joue dans le haut de page. */}
                <img
                  src={HERO_CREATION.poster}
                  alt={`Layer cake ${HERO_CREATION.title.toLowerCase()} : ${HERO_CREATION.caption}`}
                  width={464}
                  height={848}
                  decoding="async"
                  style={{ objectPosition: HERO_CREATION.focus }}
                />
              </picture>
            </figure>
            <svg className={styles.macaron} viewBox="0 0 120 120" aria-hidden="true">
              <defs>
                <path id="hero-cercle" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" />
              </defs>
              <circle cx="60" cy="60" r="58" />
              <text>
                <textPath href="#hero-cercle" textLength="272" lengthAdjust="spacing">
                  Fait maison · Fait main · Pour vos fêtes ·
                </textPath>
              </text>
              <path
                className={styles.coeur}
                d="M60 72 C 44 60, 48 46, 60 54 C 72 46, 76 60, 60 72 Z"
              />
            </svg>
            <p className={styles.note} aria-hidden="true">
              <span>salé &amp; sucré !</span>
              <svg viewBox="0 0 60 40">
                <path d="M4 6 C 20 4, 40 12, 52 32 M52 32 l -11 -2 M52 32 l 1 -11" pathLength={1} />
              </svg>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
