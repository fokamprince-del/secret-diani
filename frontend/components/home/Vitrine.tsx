'use client';

import { useEffect, useRef, useState } from 'react';
import { COURONNE, CREATIONS } from '@/lib/vitrine';
import { ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { LoopVideo } from '../ui/LoopVideo';
import styles from './Vitrine.module.css';

const MILIEU = Math.floor(CREATIONS.length / 2);

/**
 * La vitrine : de vrais gâteaux de Diani sur un rail qui défile au doigt, à la molette ou aux
 * boutons. La carte au centre est « active » : elle grandit, sa vidéo tourne (une seule à la
 * fois) et toute la section prend la couleur de sa saveur.
 */
export function Vitrine() {
  const rail = useRef<HTMLUListElement>(null);
  // On ouvre sur le gâteau du milieu : la vitrine est garnie des deux côtés.
  const [active, setActive] = useState(MILIEU);
  const creation = CREATIONS[active]!;

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

  return (
    <section
      aria-labelledby="vitrine-titre"
      className={styles.vitrine}
      data-accent={creation.accent}
    >
      <p className={styles.filigrane} aria-hidden="true" key={creation.slug}>
        {creation.title}
      </p>

      <div className={`conteneur ${styles.entete}`}>
        <div>
          <p className={styles.surtitre}>Sortis de ma cuisine</p>
          <h2 id="vitrine-titre">Des gâteaux qui font tourner les têtes</h2>
        </div>
        <div className={styles.fleches}>
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
                ) : (
                  <picture>
                    <source type="image/avif" srcSet={COURONNE.avif} sizes="20rem" />
                    <source type="image/webp" srcSet={COURONNE.webp} sizes="20rem" />
                    <img
                      src={COURONNE.fallback}
                      alt=""
                      width={COURONNE.width}
                      height={COURONNE.height}
                      loading="lazy"
                      decoding="async"
                      style={{ objectPosition: item.focus }}
                    />
                  </picture>
                )}
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
        <ButtonLink href="/traiteur" withArrow>
          Je commande mon gâteau
        </ButtonLink>
      </div>
    </section>
  );
}
