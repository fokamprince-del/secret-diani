'use client';

import { type ReactNode, useRef } from 'react';
import styles from './Inclinaison.module.css';

/**
 * Carte inclinée en 3D à la souris, avec un reflet de lumière qui suit le curseur et une
 * parallaxe interne : les enfants marqués `data-profondeur` (−1 à 1) glissent plus ou moins
 * que la carte. Au doigt, au clavier ou si le mouvement est réduit : carte immobile.
 */
export function Inclinaison({
  children,
  className,
  max = 6,
}: {
  children: ReactNode;
  className?: string;
  /** Inclinaison maximale, en degrés. */
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    if (!element || event.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width - 0.5;
      const py = (clientY - rect.top) / rect.height - 0.5;
      element.style.setProperty('--rx', `${(-py * max).toFixed(2)}deg`);
      element.style.setProperty('--ry', `${(px * max).toFixed(2)}deg`);
      element.style.setProperty('--px', px.toFixed(3));
      element.style.setProperty('--py', py.toFixed(3));
      element.style.setProperty('--lx', `${((px + 0.5) * 100).toFixed(1)}%`);
      element.style.setProperty('--ly', `${((py + 0.5) * 100).toFixed(1)}%`);
      element.dataset.incline = '';
    });
  };

  const release = () => {
    const element = ref.current;
    if (!element) return;
    cancelAnimationFrame(frame.current);
    for (const name of ['--rx', '--ry']) element.style.setProperty(name, '0deg');
    for (const name of ['--px', '--py']) element.style.setProperty(name, '0');
    delete element.dataset.incline;
  };

  return (
    <div
      ref={ref}
      className={[styles.inclinaison, className].filter(Boolean).join(' ')}
      onPointerMove={move}
      onPointerLeave={release}
    >
      {children}
      <span className={styles.reflet} aria-hidden="true" />
    </div>
  );
}
