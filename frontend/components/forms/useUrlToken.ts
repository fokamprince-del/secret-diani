'use client';

import { useEffect, useState } from 'react';

/**
 * Jeton reçu par e-mail ou au retour du paiement (`?token=…`, `?suivi=…`), lu après l'hydratation puis retiré de la barre d'adresse
 * (historique, mesure d'audience, en-tête Referer). `undefined` tant que l'adresse n'est pas
 * lue, `null` si le lien n'en contient pas.
 */
export function useUrlToken(name = 'token'): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(name);
    if (value) {
      url.searchParams.delete(name);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    // Lecture de l'adresse : possible seulement après l'hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(value);
  }, [name]);
  return token;
}
