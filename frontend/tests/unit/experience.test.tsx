import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfflineNotice } from '@/components/layout/OfflineNotice';
import { breadcrumbJsonLd } from '@/lib/seo';

describe('OfflineNotice', () => {
  it('annonce la perte puis le retour de la connexion', () => {
    vi.useFakeTimers();
    render(<OfflineNotice />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(region).toHaveTextContent('Vous êtes hors ligne.');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(region).toHaveTextContent('Connexion rétablie.');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(region).toBeEmptyDOMElement();
    vi.useRealTimers();
  });
});

describe('fil d’Ariane structuré', () => {
  it('commence à l’accueil et numérote chaque étape avec une adresse absolue', () => {
    const data = breadcrumbJsonLd([{ name: 'Boutique & kits', path: '/boutique' }]);
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: 'http://localhost:5173/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Boutique & kits',
        item: 'http://localhost:5173/boutique',
      },
    ]);
  });
});
