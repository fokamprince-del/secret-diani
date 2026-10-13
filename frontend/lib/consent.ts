/**
 * Consentement aux traceurs (RGPD). Seule la mesure d'audience est soumise à consentement ;
 * le reste du site n'utilise que des cookies strictement nécessaires.
 * Le choix est conservé 6 mois (recommandation CNIL), puis redemandé.
 */
export interface ConsentChoice {
  analytics: boolean;
  decidedAt: string;
  version: 1;
}

const STORAGE_KEY = 'diani-consent';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 182;
export const CONSENT_CHANGED_EVENT = 'diani:consent-changed';
export const CONSENT_OPEN_EVENT = 'diani:consent-open';

function isChoice(value: unknown): value is ConsentChoice {
  if (typeof value !== 'object' || value === null) return false;
  const choice = value as Record<string, unknown>;
  return (
    choice.version === 1 &&
    typeof choice.analytics === 'boolean' &&
    typeof choice.decidedAt === 'string'
  );
}

export function readConsent(now: number = Date.now()): ConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isChoice(parsed)) return null;
    if (now - new Date(parsed.decidedAt).getTime() > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    // Stockage indisponible (navigation privée, blocage) : on redemandera.
    return null;
  }
}

export function saveConsent(analytics: boolean): ConsentChoice {
  const choice: ConsentChoice = { analytics, decidedAt: new Date().toISOString(), version: 1 };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Choix valable pour la visite en cours seulement.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: choice }));
  return choice;
}

/** Rouvre le bandeau (lien « Gérer mes cookies » du pied de page). */
export function openConsentManager(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
