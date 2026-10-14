'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import styles from './OfflineNotice.module.css';

type Network = 'online' | 'offline' | 'back';

/**
 * Bandeau « hors ligne » : la connexion est perdue (métro, réseau mobile faible), on le dit
 * en mots simples ; quand elle revient, un court message le confirme. Région annoncée aux
 * lecteurs d'écran, toujours montée pour que l'annonce soit fiable.
 */
export function OfflineNotice() {
  const [network, setNetwork] = useState<Network>('online');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offline = () => {
      clearTimeout(timer);
      setNetwork('offline');
    };
    const online = () => {
      setNetwork('back');
      timer = setTimeout(() => setNetwork('online'), 4000);
    };
    // État au chargement : possible seulement après l'hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!navigator.onLine) setNetwork('offline');
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" className={styles.zone}>
      {network !== 'online' && (
        <p className={styles.bandeau} data-etat={network}>
          <Icon name={network === 'offline' ? 'alert' : 'check'} size={18} />
          {network === 'offline'
            ? 'Vous êtes hors ligne. Les pages déjà ouvertes restent lisibles ; vos actions reprendront au retour de la connexion.'
            : 'Connexion rétablie.'}
        </p>
      )}
    </div>
  );
}
