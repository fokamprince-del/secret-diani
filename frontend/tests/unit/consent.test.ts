import { describe, expect, it, vi } from 'vitest';
import { CONSENT_CHANGED_EVENT, readConsent, saveConsent } from '@/lib/consent';

describe('consentement aux cookies', () => {
  it('n’a aucun choix par défaut', () => {
    expect(readConsent()).toBeNull();
  });

  it('enregistre le choix et le diffuse', () => {
    const listener = vi.fn();
    window.addEventListener(CONSENT_CHANGED_EVENT, listener);
    saveConsent(false);
    expect(readConsent()?.analytics).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(CONSENT_CHANGED_EVENT, listener);
  });

  it('redemande le choix après six mois', () => {
    const choice = saveConsent(true);
    const sevenMonthsLater = new Date(choice.decidedAt).getTime() + 1000 * 60 * 60 * 24 * 213;
    expect(readConsent(sevenMonthsLater)).toBeNull();
  });

  it('ignore une valeur corrompue', () => {
    window.localStorage.setItem('diani-consent', '{"analytics":"oui"}');
    expect(readConsent()).toBeNull();
  });
});
