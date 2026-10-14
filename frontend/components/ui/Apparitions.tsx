'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Apparitions au défilement, pour tout le site, sans bibliothèque : les éléments marqués
 * `data-apparition` (« monte », « devoile », « trait ») qui sont encore sous l'écran passent en
 * attente, puis s'animent une seule fois en entrant dans la vue.
 *
 * Le HTML du serveur ne porte aucun état : sans JavaScript, si le mouvement est réduit ou si
 * l'élément est déjà à l'écran au chargement, tout reste visible et immobile.
 */
export function Apparitions() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-etat', 'visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );

    const fold = window.innerHeight;
    document.querySelectorAll<HTMLElement | SVGElement>('[data-apparition]').forEach((element) => {
      const state = element.getAttribute('data-etat');
      if (state === 'visible') return;
      // Déjà en attente (effet relancé : mode strict, retour sur la page) : on l'observe à nouveau.
      if (state !== 'attente') {
        if (element.getBoundingClientRect().top < fold) return;
        element.setAttribute('data-etat', 'attente');
      }
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
