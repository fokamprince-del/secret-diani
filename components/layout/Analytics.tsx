'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { publicEnv } from '@/lib/env';
import { CONSENT_CHANGED_EVENT, readConsent, type ConsentChoice } from '@/lib/consent';

/** Mesure d'audience Plausible, chargée seulement après consentement explicite. */
export function Analytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    // Le consentement n'est connu qu'après l'hydratation (stockage local).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllowed(readConsent()?.analytics === true);
    const onChange = (event: Event) => {
      const choice = (event as CustomEvent<ConsentChoice>).detail;
      // Un retrait de consentement prend effet au prochain chargement de page.
      setAllowed(choice.analytics);
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, []);

  if (!allowed || !publicEnv.plausibleDomain) return null;
  return (
    <Script
      src={publicEnv.plausibleSrc}
      data-domain={publicEnv.plausibleDomain}
      strategy="afterInteractive"
    />
  );
}
