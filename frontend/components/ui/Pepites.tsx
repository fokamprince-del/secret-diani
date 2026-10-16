'use client';

import { useEffect } from 'react';

const COULEURS = ['#e8b923', '#b8324a', '#b8742f', '#dab6aa', '#9b6155'];

/**
 * Petit jeu de pépites de sucre : un clic sur un élément marqué `data-pepites` (ajout à la
 * demande, choix d'un pack…) fait jaillir quelques pépites colorées autour du pointeur.
 * Purement décoratif, rien si le mouvement est réduit.
 */
export function Pepites() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onClick = (event: MouseEvent) => {
      if (reduced.matches) return;
      const target = (event.target as Element | null)?.closest('[data-pepites]');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = event.clientX || rect.left + rect.width / 2;
      const y = event.clientY || rect.top + rect.height / 2;
      for (let i = 0; i < 18; i += 1) {
        const pepite = document.createElement('span');
        const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
        const distance = 50 + Math.random() * 70;
        pepite.className = 'eclat-pepite';
        pepite.style.left = `${x - 4}px`;
        pepite.style.top = `${y - 4}px`;
        pepite.style.background = COULEURS[i % COULEURS.length]!;
        pepite.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
        pepite.style.setProperty('--y', `${Math.sin(angle) * distance + 30}px`);
        pepite.style.setProperty('--r', `${Math.round(Math.random() * 540 - 270)}deg`);
        if (i % 3 === 0) pepite.style.borderRadius = '50%';
        document.body.append(pepite);
        pepite.addEventListener('animationend', () => pepite.remove(), { once: true });
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
