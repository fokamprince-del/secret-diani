'use client';

import { useEffect, useRef, useState } from 'react';
import { CREATIONS } from '@/lib/vitrine';
import { ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { LoopVideo } from '../ui/LoopVideo';
import { StaticPhoto } from '../ui/StaticPhoto';
import styles from './Vitrine.module.css';

const MILIEU = Math.floor(CREATIONS.length / 2);

/** Avance automatique : une carte toutes les 5 secondes, tant que la vitrine est à l'écran. */
const CADENCE_MS = 5000;

interface VitrineProps {
  /** Identifiant du titre (unique dans la page). */
  id?: string;
  kicker?: string;
  title?: string;
  action?: { href: string; label: string };
}

/**
 * La vitrine : de vrais gâteaux de Diani sur un rail qui défile tout seul, au doigt, à la
 * molette ou aux boutons. La carte au centre est « active » : elle grandit, sa vidéo tourne (une
 * seule à la fois) et toute la section prend la couleur de sa saveur. L'avance automatique
 * s'arrête au survol, au focus, au toucher, sur demande (bouton pause) et si le mouvement est
 * réduit.
 */
export function Vitrine({
  id = 'vitrine-titre',
  kicker = 'Sortis de ma cuisine',
  title = 'Des gâteaux qui font tourner les têtes',
  action = { href: '/traiteur', label: 'Je commande mon gâteau' },
}: VitrineProps = {}) {
  const section = useRef<HTMLElement>(null);
  const rail = useRef<HTMLUListElement>(null);
  // On ouvre sur le gâteau du milieu : la vitrine est garnie des deux côtés.
  const [active, setActive] = useState(MILIEU);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  const creation = CREATIONS[active]!;

  useEffect(() => {
    const element = section.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      threshold: 0.4,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const list = rail.current;
    if (!list) return;
    const middle = list.children[MILIEU] as HTMLElement | undefined;
    if (middle) list.scrollLeft = middle.offsetLeft - (list.clientWidth - middle.clientWidth) / 2;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      // Une bande étroite au centre du rail : la carte qui la traverse est l'active.
      { root: list, rootMargin: '0px -45% 0px -45%', threshold: 0 },
    );
    list.querySelectorAll('li').forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const goTo = (index: number) => {
    const list = rail.current;
    const target = list?.children[(index + CREATIONS.length) % CREATIONS.length] as
      HTMLElement | undefined;
    if (!list || !target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({
      left: target.offsetLeft - (list.clientWidth - target.clientWidth) / 2,
      behavior: reduce ? 'auto' : 'smooth',
    });
  };

  const autoplay = visible && !paused && !held;
  useEffect(() => {
    if (!autoplay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => goTo(active + 1), CADENCE_MS);
    return () => window.clearTimeout(timer);
    // goTo ne dépend que des refs : relancer à chaque carte active suffit.
  }, [autoplay, active]);
  return (
    <section
      ref={section}
      aria-labelledby={id}
      className={styles.vitrine}
      data-accent={creation.accent}
      data-auto={autoplay || undefined}
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHeld(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && setHeld(false)}
      onTouchStart={() => setPaused(true)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      <p className={styles.filigrane} aria-hidden="true" key={creation.slug}>
        {creation.title}
      </p>

      <div className={`conteneur ${styles.entete}`}>
        <div>
          <p className={styles.surtitre}>{kicker}</p>
          <h2 id={id}>{title}</h2>
        </div>
        <div className={styles.fleches}>
          <button
            type="button"
            className={styles.fleche}
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? 'Reprendre le défilement' : 'Mettre le défilement en pause'}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              {paused ? (
                <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
              ) : (
                <path d="M8 5.5v13M16 5.5v13" stroke="currentColor" strokeWidth="2.4" />
              )}
            </svg>
          </button>
          <button
            type="button"
            className={styles.fleche}
            onClick={() => goTo(active - 1)}
            aria-label="Gâteau précédent"
          >
            <Icon name="arrowRight" size={20} className={styles.gauche} />
          </button>
          <button
            type="button"
            className={styles.fleche}
            onClick={() => goTo(active + 1)}
            aria-label="Gâteau suivant"
          >
            <Icon name="arrowRight" size={20} />
          </button>
        </div>
      </div>

      <ul ref={rail} role="list" className={styles.rail} tabIndex={0} aria-label="Créations">
        {CREATIONS.map((item, index) => (
          <li
            key={item.slug}
            data-index={index}
            data-accent={item.accent}
            className={styles.carte}
            aria-current={index === active || undefined}
          >
            <figure className={styles.figure}>
              <div className={styles.media}>
                {item.video ? (
                  <LoopVideo
                    src={item.video}
                    poster={item.poster}
                    focus={item.focus}
                    playing={index === active}
                  />
                ) : item.photo ? (
                  <StaticPhoto photo={item.photo} sizes="20rem" focus={item.focus} decorative />
                ) : null}
                <span className={styles.pastille} aria-hidden="true" />
              </div>
              <figcaption className={styles.legende}>
                <strong>{item.title}</strong>
                <span>{item.caption}</span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      <div className={`conteneur ${styles.pied}`}>
        <ol role="list" className={styles.points} aria-label="Choisir un gâteau">
          {CREATIONS.map((item, index) => (
            <li key={item.slug}>
              <button
                type="button"
                className={styles.point}
                aria-label={item.title}
                aria-current={index === active || undefined}
                onClick={() => goTo(index)}
              />
            </li>
          ))}
        </ol>
        <ButtonLink href={action.href} withArrow>
          {action.label}
        </ButtonLink>
      </div>
    </section>
  );
}
