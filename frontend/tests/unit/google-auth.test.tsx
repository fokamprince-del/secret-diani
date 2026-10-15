import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** `publicEnv` est lu au chargement du module : on le recharge après chaque réglage. */
async function loadButton(enabled: boolean) {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_AUTH', enabled ? 'true' : '');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://demo.example');
  return (await import('@/components/auth/GoogleButton')).GoogleButton;
}

describe('Connexion avec Google', () => {
  it('absente tant que la connexion Google n’est pas configurée', async () => {
    const GoogleButton = await loadButton(false);
    const { container } = render(<GoogleButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mène à l’API avec la page de retour demandée', async () => {
    const GoogleButton = await loadButton(true);
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
