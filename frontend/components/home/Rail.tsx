'use client';

import Link from 'next/link';
import { type ReactNode, useId, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import styles from './Selections.module.css';

export interface RailItem {
  id: string;
  title: string;
  /** Ligne d'information (format, nombre de leçons…). */
  meta?: string;
  price?: string;
  href: string;
  visual: ReactNode;
}

export interface RailTab {
  label: string;
  items: RailItem[];
}

/**
 * Petit carrousel de cartes, au doigt ou aux flèches, avec onglets facultatifs (maquette :
 * « Plats / Menus… »). Les onglets suivent le motif ARIA tablist ; les flèches font défiler
 * d'une carte.
 */
export function Rail({ tabs, label }: { tabs: RailTab[]; label: string }) {
  const [current, setCurrent] = useState(0);
  const rail = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const items = tabs[current]?.items ?? [];

  const scroll = (direction: 1 | -1) => {
    const list = rail.current;
    const card = list?.firstElementChild as HTMLElement | null;
    if (!list || !card) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollBy({
      left: direction * (card.offsetWidth + 16),
      behavior: reduce ? 'auto' : 'smooth',
    });
  };

  const choose = (index: number) => {
    setCurrent(index);
    rail.current?.scrollTo({ left: 0 });
  };

  return (
    <div className={styles.railBloc}>
      {tabs.length > 1 && (
        <div role="tablist" aria-label={label} className={styles.onglets}>
          {tabs.map((tab, index) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              id={`${baseId}-onglet-${index}`}
              aria-selected={index === current}
              aria-controls={`${baseId}-panneau`}
              tabIndex={index === current ? 0 : -1}
              className={styles.onglet}
              onClick={() => choose(index)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                const next =
                  (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                choose(next);
                document.getElementById(`${baseId}-onglet-${next}`)?.focus();
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div
        className={styles.railCadre}
        id={`${baseId}-panneau`}
        role={tabs.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={tabs.length > 1 ? `${baseId}-onglet-${current}` : undefined}
      >
        <button
          type="button"
          className={`${styles.fleche} ${styles.flecheGauche}`}
          onClick={() => scroll(-1)}
          aria-label="Défiler vers la gauche"
        >
          <Icon name="arrowRight" size={18} className={styles.retourne} />
        </button>
        <ul ref={rail} role="list" className={styles.rail} key={current}>
          {items.map((item) => (
            <li key={item.id} className={styles.carte}>
              <Link href={item.href} className={`${styles.carteLien} sans-filet`}>
                <span className={styles.carteVisuel}>{item.visual}</span>
                <span className={styles.carteTexte}>
                  <span className={styles.carteTitre}>{item.title}</span>
                  {item.meta && <span className={styles.carteMeta}>{item.meta}</span>}
                  <span className={styles.cartePied}>
                    {item.price && <span className={styles.prix}>{item.price}</span>}
                    <span className={styles.pastille} aria-hidden="true">
                      <Icon name="arrowRight" size={16} />
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`${styles.fleche} ${styles.flecheDroite}`}
          onClick={() => scroll(1)}
          aria-label="Défiler vers la droite"
        >
          <Icon name="arrowRight" size={18} />
        </button>
      </div>
    </div>
  );
}
