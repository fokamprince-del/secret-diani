'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CONSENT_OPEN_EVENT, readConsent, saveConsent } from '@/lib/consent';
import { Button } from '../ui/Button';
import styles from './CookieConsent.module.css';

/**
 * Bandeau de consentement. « Refuser » est aussi visible et aussi simple qu'« Accepter ».
 * Non modal : la page reste utilisable, et rien n'est déposé avant un choix.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Lecture du stockage local : uniquement possible après l'hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!readConsent()) setVisible(true);
    const reopen = () => {
      setVisible(true);
      requestAnimationFrame(() => titleRef.current?.focus());
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  if (!visible) return null;

  const decide = (analytics: boolean) => {
    saveConsent(analytics);
    setVisible(false);
  };

  return (
    <section className={styles.bandeau} aria-labelledby="consentement-titre">
      <div className={styles.contenu}>
        <h2 id="consentement-titre" ref={titleRef} tabIndex={-1} className={styles.titre}>
          Vos cookies, votre choix
        </h2>
        <p className={styles.texte}>
          Avec votre accord, nous mesurons l’audience du site pour l’améliorer, sans publicité ni
          revente de données. Vous pouvez changer d’avis à tout moment depuis le pied de page.{' '}
          <Link href="/confidentialite">En savoir plus</Link>
        </p>
        <div className={styles.boutons}>
          <Button variant="secondaire" onClick={() => decide(false)}>
            Refuser
          </Button>
          <Button variant="secondaire" onClick={() => decide(true)}>
            Accepter
          </Button>
        </div>
      </div>
    </section>
  );
}
