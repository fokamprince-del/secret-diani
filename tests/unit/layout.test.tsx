import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CookieConsent } from '@/components/layout/CookieConsent';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { readConsent } from '@/lib/consent';
import { navigation } from '../navigation-mock';
import { axeViolations } from './axe';

describe('Header', () => {
  it('présente les six rubriques dans l’ordre et signale la page courante', () => {
    navigation.pathname = '/boutique/kit-expert';
    render(<Header />);
    const nav = screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!;
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Traiteur',
      'Formations',
      'Boutique',
      'Conseils',
      'À propos',
      'Contact',
    ]);
    expect(within(nav).getByRole('link', { name: 'Boutique' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    navigation.pathname = '/';
  });

  it('ouvre le menu mobile et le referme au choix d’une rubrique', async () => {
    const { container } = render(<Header />);
    const dialog = container.querySelector('dialog')!;
    // jsdom ne sait pas changer de document : on garde le clic, sans la navigation.
    dialog.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    expect(dialog).toHaveAttribute('open');
    await userEvent.click(within(dialog).getByRole('link', { name: 'Formations' }));
    expect(dialog).not.toHaveAttribute('open');
  });

  it('n’a pas de violation d’accessibilité', async () => {
    const { container } = render(<Header />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Footer', () => {
  it('donne accès aux pages légales, à Instagram et à la gestion des cookies', async () => {
    const { container } = render(<Footer />);
    expect(screen.getByRole('link', { name: /Mentions légales/ })).toHaveAttribute(
      'href',
      '/mentions-legales',
    );
    expect(screen.getByRole('link', { name: /@diani_cuisto/ })).toHaveAttribute(
      'href',
      'https://www.instagram.com/diani_cuisto/',
    );
    expect(screen.getByRole('button', { name: 'Gérer mes cookies' })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('CookieConsent', () => {
  it('refuser est aussi simple qu’accepter, et le choix est mémorisé', async () => {
    render(<CookieConsent />);
    const region = await screen.findByRole('region', { name: 'Vos cookies, votre choix' });
    const refuse = within(region).getByRole('button', { name: 'Refuser' });
    const accept = within(region).getByRole('button', { name: 'Accepter' });
    expect(refuse.className).toBe(accept.className);
    await userEvent.click(refuse);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(readConsent()?.analytics).toBe(false);
  });

  it('se rouvre depuis le lien « Gérer mes cookies »', async () => {
    window.localStorage.setItem(
      'diani-consent',
      JSON.stringify({ analytics: true, decidedAt: new Date().toISOString(), version: 1 }),
    );
    render(
      <>
        <CookieConsent />
        <Footer />
      </>,
    );
    expect(screen.queryByRole('region', { name: 'Vos cookies, votre choix' })).toBeNull();
    await act(() => userEvent.click(screen.getByRole('button', { name: 'Gérer mes cookies' })));
    expect(screen.getByRole('region', { name: 'Vos cookies, votre choix' })).toBeInTheDocument();
  });
});
