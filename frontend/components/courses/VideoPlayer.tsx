'use client';

import { useEffect, useRef, useState } from 'react';
import type { Lesson } from '@/lib/api/types';
import { Icon } from '../ui/Icon';
import styles from './VideoPlayer.module.css';

/** Intervalle d'enregistrement de la position (secondes de lecture), comme demandé par l'API. */
export const SAVE_EVERY_SECONDS = 15;

/**
 * Décide s'il faut envoyer la position : au plus une fois toutes les 15 s de lecture, et
 * toujours à la pause ou à la fin (logique isolée pour être testée).
 */
export function shouldSave(position: number, lastSaved: number, force: boolean): boolean {
  if (force) return Math.abs(position - lastSaved) >= 1;
  return position - lastSaved >= SAVE_EVERY_SECONDS || position < lastSaved - SAVE_EVERY_SECONDS;
}

interface VideoPlayerProps {
  title: string;
  video: Lesson['video'];
  /** Position de reprise (secondes) ; 0 pour commencer au début. */
  startAt: number;
  /** Absent : leçon d'exemple sans compte, rien n'est enregistré. */
  onProgress?: (positionSeconds: number, completed: boolean) => void;
}

/**
 * Lecteur vidéo des leçons (Bunny Stream, URL HLS signée et courte fournie par l'API).
 * Lecture HLS native (Safari, iOS) ou hls.js, chargé seulement ici. Commandes natives du
 * navigateur (clavier, plein écran, sous-titres si la piste existe). Format vertical 9:16 sur
 * mobile, cadre adapté sur grand écran.
 */
export function VideoPlayer({ title, video, startAt, onProgress }: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(startAt);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    const source = video.hlsUrl;
    if (!element || !source) return;
    let destroy: (() => void) | undefined;
    let cancelled = false;

    const resume = () => {
      if (startAt > 0 && element.duration && startAt < element.duration - 5)
        element.currentTime = startAt;
    };
    element.addEventListener('loadedmetadata', resume, { once: true });

    if (element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = source;
    } else {
      import('hls.js').then(
        ({ default: Hls }) => {
          if (cancelled) return;
          if (!Hls.isSupported()) {
            setFailed(true);
            return;
          }
          const hls = new Hls({ capLevelToPlayerSize: true });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setFailed(true);
          });
          hls.loadSource(source);
          hls.attachMedia(element);
          destroy = () => hls.destroy();
        },
        () => setFailed(true),
      );
    }
    return () => {
      cancelled = true;
      element.removeEventListener('loadedmetadata', resume);
      destroy?.();
    };
  }, [video.hlsUrl, startAt]);

  const report = (force: boolean, completed = false) => {
    const element = ref.current;
    if (!element || !onProgress) return;
    const position = Math.floor(element.currentTime);
    if (!completed && !shouldSave(position, lastSaved.current, force)) return;
    lastSaved.current = position;
    onProgress(position, completed);
  };

  if (!video.hlsUrl || failed) {
    return (
      <div className={styles.indisponible} role="status">
        <Icon name="play" size={32} />
        <p>
          La vidéo est momentanément indisponible. Les conseils et la fiche restent consultables
          ci-dessous.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.cadre}>
      {/* Les sous-titres sont fournis par Bunny dans la playlist HLS quand ils existent. */}
      <video
        ref={ref}
        className={styles.video}
        controls
        playsInline
        preload="metadata"
        aria-label={`Vidéo : ${title}`}
        onTimeUpdate={() => report(false)}
        onPause={() => report(true)}
        onEnded={() => report(true, true)}
      />
    </div>
  );
}
