import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CookieConsent } from '@/components/layout/CookieConsent';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { readConsent } from '@/lib/consent';
import { socialLinksFrom } from '@/lib/social';
import { settings } from '../mock-api/fixtures.mts';
import { navigation } from '../navigation-mock';
import { axeViolations } from './axe';

const socials = socialLinksFrom(settings);
const instagram = socials[0]!;

describe('Header', () => {
  it('présente les six rubriques dans l’ordre et signale la page courante', () => {
    navigation.pathname = '/boutique/kit-expert';
    render(<Header social={instagram} />);
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
    const { container } = render(<Header social={instagram} />);
    const dialog = container.querySelector('dialog')!;
    // jsdom ne sait pas changer de document : on garde le clic, sans la navigation.
    dialog.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    expect(dialog).toHaveAttribute('open');
    await userEvent.click(within(dialog).getByRole('link', { name: 'Formations' }));
    expect(dialog).not.toHaveAttribute('open');
  });

  it('n’a pas de violation d’accessibilité', async () => {
    const { container } = render(<Header social={instagram} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Footer', () => {
  it('donne accès aux pages légales, aux réseaux, à l’e-mail et à la gestion des cookies', async () => {
    const { container } = render(<Footer settings={settings} socials={socials} />);
    expect(screen.getByRole('link', { name: /Mentions légales/ })).toHaveAttribute(
      'href',
      '/mentions-legales',
    );
    expect(screen.getByRole('link', { name: /@diani_cuisto/ })).toHaveAttribute(
      'href',
      'https://www.instagram.com/diani_cuisto/',
    );
    expect(screen.getByRole('link', { name: 'bonjour@exemple.fr' })).toHaveAttribute(
      'href',
      'mailto:bonjour@exemple.fr',
    );
    expect(screen.getByRole('button', { name: 'Gérer mes cookies' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'La lettre de Diani' })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('masque les réseaux et l’e-mail absents des réglages', () => {
    const empty = {
      ...settings,
      contactEmail: '',
      socialLinks: { instagram: '', tiktok: '', facebook: '', youtube: '' },
    };
    render(<Footer settings={empty} socials={socialLinksFrom(empty)} />);
    expect(screen.queryByRole('link', { name: /Instagram/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /@/ })).toBeNull();
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
        <Footer settings={null} socials={[]} />
      </>,
    );
    expect(screen.queryByRole('region', { name: 'Vos cookies, votre choix' })).toBeNull();
    await act(() => userEvent.click(screen.getByRole('button', { name: 'Gérer mes cookies' })));
    expect(screen.getByRole('region', { name: 'Vos cookies, votre choix' })).toBeInTheDocument();
  });
});
