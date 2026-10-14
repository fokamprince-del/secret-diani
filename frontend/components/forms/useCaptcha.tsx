'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { publicEnv } from '@/lib/env';

const SITE_KEY = publicEnv.turnstileSiteKey;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      appearance: 'interaction-only';
      language: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoading: Promise<void> | null = null;

/** Script Turnstile chargé une seule fois, à la demande (jamais au chargement de la page). */
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoading = null;
      reject(new Error('Turnstile indisponible'));
    };
    document.head.append(script);
  });
  return scriptLoading;
}

export const captchaEnabled = SITE_KEY !== undefined;

/**
 * Anti-robot discret (Cloudflare Turnstile, mode « interaction seulement ») : invisible pour la
 * plupart des visiteurs, un défi n'apparaît qu'en cas de doute. Le script n'est chargé qu'au
 * premier contact avec le formulaire (`activate`), pour ne rien coûter aux autres visiteurs.
 * Sans clé publique configurée, tout est inactif (développement, tests).
 */
export function useCaptcha() {
  const [active, setActive] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!active || !SITE_KEY) return;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          language: 'fr',
          callback: (value) => {
            token.current = value;
          },
          'expired-callback': () => {
            token.current = undefined;
          },
          'error-callback': () => {
            token.current = undefined;
          },
        });
      })
      .catch(() => {
        // L'envoi signalera l'absence de vérification ; l'API reste juge.
      });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [active]);

  const activate = useCallback(() => setActive(true), []);

  /** Jeton à joindre à l'envoi ; `undefined` si la vérification n'est pas encore terminée. */
  const getToken = useCallback(() => token.current, []);

  /** Un jeton ne sert qu'une fois : nouveau défi après chaque envoi. */
  const reset = useCallback(() => {
    token.current = undefined;
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  return { activate, getToken, reset, container };
}

/** Emplacement du défi Turnstile (vide tant qu'aucun défi n'est nécessaire). */
export function CaptchaSlot({ container }: { container: RefObject<HTMLDivElement | null> }) {
  if (!captchaEnabled) return null;
  return <div ref={container} />;
}

export const CAPTCHA_PENDING_MESSAGE =
  'Vérification anti-robot en cours. Patientez une seconde, puis renvoyez le formulaire.';
