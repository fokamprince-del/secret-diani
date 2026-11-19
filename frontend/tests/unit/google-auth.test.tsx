import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** `publicEnv` est lu au chargement du module : on le recharge après chaque réglage. */
async function loadButton(flag: string) {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH', flag);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://demo.example');
  return (await import('@/components/auth/GoogleButton')).GoogleButton;
}

describe('Connexion avec Google', () => {
  it('affichée par défaut, masquée seulement par NEXT_PUBLIC_GOOGLE_AUTH=false', async () => {
    const parDefaut = await loadButton('');
    const { unmount } = render(parDefaut({}));
    expect(screen.getByRole('link', { name: /Continuer avec Google/ })).toBeInTheDocument();
    unmount();
    vi.resetModules();
    const masque = await loadButton('false');
    const { container } = render(masque({}));
    expect(container).toBeEmptyDOMElement();
  });

  it('mène à l’API avec la page de retour demandée', async () => {
    const GoogleButton = await loadButton('true');
    render(<GoogleButton returnTo="/formations" mention />);
    expect(screen.getByRole('link', { name: 'Continuer avec Google' })).toHaveAttribute(
      'href',
      'https://demo.example/api/v1/auth/google?suite=%2Fformations',
    );
    expect(screen.getByRole('link', { name: 'politique de confidentialité' })).toHaveAttribute(
      'href',
      '/confidentialite',
    );
  });
});
