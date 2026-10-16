import type { CSSProperties, ReactNode } from 'react';
import { preload } from 'react-dom';
import { CremeTrait } from '../ui/CremeTrait';
import { Icon, type IconName } from '../ui/Icon';
import { LoopVideo } from '../ui/LoopVideo';
import styles from './PageHeader.module.css';

/** Scène visuelle des grandes pages : une vidéo sous arche, un médaillon, une note manuscrite. */
export interface PageHeaderVisual {
  video?: string;
  poster: string;
  focus?: string;
  /** Description de la vidéo (pour les lecteurs d'écran). */
  caption: string;
  /** Affiche d'un second visuel, en médaillon rond. */
  medaillon?: { src: string; alt: string; focus?: string };
  /** Petite note manuscrite posée sur la scène. */
  note?: string;
}

interface PageHeaderProps {
  title: string;
  /** Courte introduction sous le titre. */
  intro?: ReactNode;
  /** Ligne d'information au-dessus du titre (catégorie, rubrique). */
  eyebrow?: ReactNode;
  /** Informations sous l'introduction (date de mise à jour, temps de lecture). */
  meta?: ReactNode;
  /** Couleur de saveur du décor (traiteur : mangue, formations : framboise…). */
  accent?: 'mangue' | 'framboise' | 'caramel';
  /** Scène visuelle à droite (grandes pages) ; sans elle, une tache couleur saveur. */
  visual?: PageHeaderVisual;
  /** Engagements courts sous l'introduction, avec leur icône. */
  points?: { icon: IconName; label: string }[];
  /** Actions (boutons) sous l'introduction. */
  actions?: ReactNode;
}

/** Pépites décoratives : position, taille, couleur, dérive (fixes d'un rendu à l'autre). */
const PEPITES = [
  { left: '8%', top: '18%', taille: 10, couleur: 'var(--mangue)', retard: 0 },
  { left: '88%', top: '12%', taille: 8, couleur: 'var(--framboise)', retard: 1.2 },
  { left: '72%', top: '78%', taille: 12, couleur: 'var(--caramel)', retard: 2.1 },
  { left: '18%', top: '82%', taille: 7, couleur: 'var(--nude)', retard: 0.6 },
  { left: '52%', top: '6%', taille: 6, couleur: 'var(--mangue)', retard: 3 },
  { left: '95%', top: '55%', taille: 9, couleur: 'var(--nude)', retard: 1.8 },
];

/**
 * En-tête des pages intérieures : le seul `h1` de la page, souligné du trait de crème qui se
 * dessine. Les grandes pages reçoivent une scène (vraie vidéo de Diani sous une arche, médaillon,
 * note manuscrite, pépites qui flottent) ; les autres gardent une tache couleur saveur.
 */
export function PageHeader({
  title,
  intro,
  eyebrow,
  meta,
  accent = 'mangue',
  visual,
  points,
  actions,
}: PageHeaderProps) {
  if (visual) preload(visual.poster, { as: 'image', fetchPriority: 'high' });
  return (
    <header
      className={styles.bandeau}
      data-accent={accent}
      data-scene-visuelle={!!visual || undefined}
    >
      <span className={styles.fondHalo} aria-hidden="true" />
      <div className="pepites-flottantes" aria-hidden="true">
        {PEPITES.map((pepite) => (
          <span
            key={`${pepite.left}-${pepite.top}`}
            style={
              {
                left: pepite.left,
                top: pepite.top,
                '--taille': `${pepite.taille}px`,
                '--couleur': pepite.couleur,
                '--retard': `${pepite.retard}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className={`conteneur ${styles.entete}`}>
        <div className={styles.texte}>
          {!visual && <span className={styles.tache} aria-hidden="true" />}
          {eyebrow && (
            <p className={styles.surtitre}>
              <CremeTrait variant="puce" />
              {eyebrow}
            </p>
          )}
          <h1 className={styles.titre}>{title}</h1>
          <CremeTrait mouvement="chargement" className={styles.trait} />
          {intro && <div className={styles.intro}>{intro}</div>}
          {actions && <div className={styles.actions}>{actions}</div>}
          {points && points.length > 0 && (
            <ul role="list" className={styles.points}>
              {points.map((point) => (
                <li key={point.label}>
                  <Icon name={point.icon} size={18} />
                  {point.label}
                </li>
              ))}
            </ul>
          )}
          {meta && <p className={styles.meta}>{meta}</p>}
        </div>

        {visual && (
          <div className={styles.scene}>
            <span className={styles.halo} aria-hidden="true" />
            <figure className={styles.arche}>
              {visual.video ? (
                <LoopVideo src={visual.video} poster={visual.poster} focus={visual.focus} />
              ) : (
                <picture>
                  <img
                    src={visual.poster}
                    alt=""
                    width={464}
                    height={848}
                    decoding="async"
                    style={{ objectPosition: visual.focus }}
                  />
                </picture>
              )}
              <figcaption className="visually-hidden">{visual.caption}</figcaption>
            </figure>
            {visual.medaillon && (
              <figure className={styles.medaillon}>
                <picture>
                  <img
                    src={visual.medaillon.src}
                    alt={visual.medaillon.alt}
                    width={464}
                    height={848}
                    decoding="async"
                    loading="lazy"
                    style={{ objectPosition: visual.medaillon.focus }}
                  />
                </picture>
              </figure>
            )}
            {visual.note && (
              <p className={styles.note} aria-hidden="true">
                {visual.note}
              </p>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
