import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactForm } from '@/components/forms/ContactForm';
import { NewsletterForm } from '@/components/forms/NewsletterForm';
import { DianiWord } from '@/components/home/DianiWord';
import { Reviews } from '@/components/home/Reviews';
import { Universes } from '@/components/home/Universes';
import { browserApi } from '@/lib/api/client';
import { socialLinksFrom, whatsappLink } from '@/lib/social';
import { home, reviews, settings } from '../mock-api/fixtures.mts';
import { axeViolations } from './axe';

afterEach(() => vi.restoreAllMocks());

function apiResponse(status: number, data: unknown) {
  const response = new Response(JSON.stringify(data), { status });
  return status < 400 ? { data, response } : { error: data, response };
}

describe('Universes', () => {
  it('trois univers, un bouton chacun, aucun prix', async () => {
    const { container } = render(<Universes universes={home.universes} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Des saveurs qui marquent vos moments',
      'Apprenez, cuisinez, réalisez vos rêves',
      'Équipez-vous comme à l’atelier',
    ]);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/traiteur',
      '/formations',
      '/boutique',
    ]);
    expect(container.textContent).not.toContain('€');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('reste lisible sans contenu de l’API (titres et boutons)', () => {
    render(<Universes universes={null} />);
    expect(screen.getByRole('link', { name: 'Découvrir la boutique' })).toHaveAttribute(
      'href',
      '/boutique',
    );
  });
});

describe('Reviews', () => {
  it('affiche les avis avec une note lisible par les lecteurs d’écran', async () => {
    const { container } = render(<Reviews reviews={reviews} />);
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Note : 4,8 sur 5')).toBeInTheDocument();
    expect(screen.getByText(/4,8 sur 5, d’après 4 avis/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('n’affiche rien sans avis publié (aucun avis inventé)', () => {
    const { container } = render(<Reviews reviews={{ items: [], count: 0, average: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DianiWord', () => {
  it('découpe le texte en paragraphes et signe', () => {
    render(<DianiWord word={home.dianiWord} />);
    expect(screen.getAllByText(/./, { selector: 'blockquote p' })).toHaveLength(2);
    expect(screen.getByText('Diani', { selector: 'figcaption' })).toBeInTheDocument();
  });

  it('est masqué quand le texte est vide', () => {
    const { container } = render(<DianiWord word={{ text: '', signature: 'Diani' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ContactForm', () => {
  it('valide avant l’envoi, en français, sans appeler l’API', async () => {
    const post = vi.spyOn(browserApi, 'POST');
    render(<ContactForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer mon message' }));
    expect(await screen.findByText('Indiquez votre nom.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Votre nom' })).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
  });

  it('envoie les champs attendus (téléphone vide → null, piège vide) puis confirme', async () => {
    const post = vi
      .spyOn(browserApi, 'POST')
      .mockResolvedValue(apiResponse(201, { message: 'Message bien reçu.' }) as never);
    render(<ContactForm />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre nom' }), 'Awa Diallo');
    await userEvent.type(screen.getByRole('textbox', { name: /Votre e-mail/ }), 'awa@exemple.fr');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Le sujet' }), 'courses');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Votre message' }),
      'Une question sur le pack Premium.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer mon message' }));
    expect(await screen.findByText('Message bien reçu.')).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/api/v1/contact', {
      body: {
        name: 'Awa Diallo',
        email: 'awa@exemple.fr',
        phone: null,
        subject: 'courses',
        message: 'Une question sur le pack Premium.',
        website: undefined,
        captchaToken: undefined,
      },
    });
  });

  it('le champ piège est hors du parcours clavier et masqué aux lecteurs d’écran', () => {
    const { container } = render(<ContactForm />);
    const trap = container.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('NewsletterForm', () => {
  it('exige la case de consentement, au texte exact attendu par l’API', async () => {
    const post = vi.spyOn(browserApi, 'POST');
    render(<NewsletterForm />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre e-mail' }), 'awa@exemple.fr');
    await userEvent.click(screen.getByRole('button', { name: 'M’inscrire à la lettre' }));
    expect(
      await screen.findByText('Cochez la case pour confirmer votre inscription.'),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(
      /J’accepte de recevoir par e-mail les nouvelles des Secrets de Diani/,
    );
  });

  it('annonce une erreur de l’API dans la région d’alerte', async () => {
    vi.spyOn(browserApi, 'POST').mockResolvedValue(
      apiResponse(429, {
        statusCode: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Trop de tentatives.',
        requestId: 'x',
      }) as never,
    );
    render(<NewsletterForm />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre e-mail' }), 'awa@exemple.fr');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'M’inscrire à la lettre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de tentatives.');
  });
});

describe('Réseaux et WhatsApp', () => {
  it('ne garde que les réseaux renseignés en https, avec leur nom de compte', () => {
    expect(socialLinksFrom(settings)).toEqual([
      {
        network: 'instagram',
        label: 'Instagram',
        href: 'https://www.instagram.com/diani_cuisto/',
        handle: '@diani_cuisto',
      },
    ]);
    expect(
      socialLinksFrom({
        ...settings,
        socialLinks: { instagram: 'http://x.fr/a', tiktok: '', facebook: '', youtube: '' },
      }),
    ).toEqual([]);
  });

  it('retombe sur le compte Instagram de référence si l’API n’a pas répondu', () => {
    expect(socialLinksFrom(null)[0]?.handle).toBe('@diani_cuisto');
  });

  it('construit un lien wa.me avec message, ou rien sans numéro', () => {
    expect(whatsappLink('+33 6 12 34 56 78', 'Bonjour')).toBe(
      'https://wa.me/33612345678?text=Bonjour',
    );
    expect(whatsappLink('')).toBeNull();
    expect(whatsappLink(undefined)).toBeNull();
  });
});
