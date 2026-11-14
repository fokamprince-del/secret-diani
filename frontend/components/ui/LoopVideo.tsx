'use client';

import { useEffect, useRef } from 'react';
import styles from './LoopVideo.module.css';

interface LoopVideoProps {
  src: string;
  poster: string;
  /** Cadrage (`object-position`), ex. « 50% 70% ». */
  focus?: string;
  /** Lecture pilotée par le parent (vitrine : seule la carte active joue). */
  playing?: boolean;
  className?: string;
}

function motionAllowed() {
  // Navigateur ancien ou environnement de test : on reste sur l'affiche.
  if (typeof window.matchMedia !== 'function' || !('IntersectionObserver' in window)) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !connection?.saveData;
}

/**
 * Boucle vidéo d'ambiance, muette et décorative (le texte voisin la décrit). Rien n'est
 * téléchargé avant qu'elle n'approche de l'écran ; elle ne joue que visible, et reste sur son
 * affiche si l'appareil demande de réduire les animations ou d'économiser les données.
 */
export function LoopVideo({ src, poster, focus, playing, className }: LoopVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || !motionAllowed()) return;

    const sync = () => {
      const shouldPlay = visible.current && playing !== false && !document.hidden;
      if (shouldPlay) {
        if (!video.src) video.src = src;
        void video.play().catch(() => {
          // Lecture refusée (mode économie d'énergie) : l'affiche reste.
        });
      } else if (!video.paused) {
        video.pause();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = !!entry?.isIntersecting;
        sync();
      },
      { threshold: 0.35 },
    );
    observer.observe(video);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [src, playing]);

  return (
    <video
      ref={ref}
      className={[styles.video, className].filter(Boolean).join(' ')}
      style={focus ? { objectPosition: focus } : undefined}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
    />
  );
}
