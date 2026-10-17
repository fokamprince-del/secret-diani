'use client';

import { type ReactNode, useRef } from 'react';
import styles from './Magnetique.module.css';

/**
 * Bouton « magnétique » : à la souris, l'enveloppe suit doucement le curseur (attraction de
 * `force` × l'écart au centre), puis revient en place avec un léger rebond. Rien au doigt, au
 * clavier ni si le mouvement est réduit : le bouton reste un bouton ordinaire.
 */
export function Magnetique({ children, force = 0.28 }: { children: ReactNode; force?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  const move = (event: React.PointerEvent<HTMLSpanElement>) => {
    const element = ref.current;
    if (!element || event.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) * force;
    const y = (event.clientY - rect.top - rect.height / 2) * force;
    element.style.setProperty('--mx', `${x.toFixed(1)}px`);
    element.style.setProperty('--my', `${y.toFixed(1)}px`);
    element.dataset.attire = '';
  };

  const release = () => {
    const element = ref.current;
    if (!element) return;
    element.style.setProperty('--mx', '0px');
    element.style.setProperty('--my', '0px');
    delete element.dataset.attire;
  };

  return (
    <span ref={ref} className={styles.aimant} onPointerMove={move} onPointerLeave={release}>
      {children}
    </span>
  );
}
