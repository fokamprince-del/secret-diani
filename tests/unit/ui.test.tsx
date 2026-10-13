import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CheckboxField, TextAreaField, TextField } from '@/components/forms/Field';
import { Accordion } from '@/components/ui/Accordion';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, FormStatus } from '@/components/ui/States';
import { axeViolations } from './axe';

describe('Button', () => {
  it('déclenche l’action et reste un vrai bouton (pas d’envoi de formulaire par défaut)', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ajouter au panier</Button>);
    const button = screen.getByRole('button', { name: 'Ajouter au panier' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('empêche le double envoi pendant le chargement et l’annonce', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Envoyer ma demande
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Envoyer ma demande' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('rend un lien quand l’action est une navigation', () => {
    render(
      <ButtonLink href="/formations" withArrow>
        Choisir ce pack
      </ButtonLink>,
    );
    expect(screen.getByRole('link', { name: 'Choisir ce pack' })).toHaveAttribute(
      'href',
      '/formations',
    );
  });
});

describe('Champs de formulaire', () => {
  it('relie libellé, aide et erreur au champ', async () => {
    const { container } = render(
      <form>
        <TextField
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          hint="Nous vous répondons sous 48 h."
          error="Saisissez une adresse e-mail valide, par exemple nom@exemple.fr."
        />
        <TextAreaField label="Votre message" optional />
        <CheckboxField label="J’accepte les conditions générales" />
      </form>,
    );
    const input = screen.getByLabelText('Adresse e-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription(
      'Nous vous répondons sous 48 h. Saisissez une adresse e-mail valide, par exemple nom@exemple.fr.',
    );
    expect(screen.getByLabelText('Votre message (facultatif)')).not.toBeRequired();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Accordion', () => {
  // L'activation au clavier (Entrée, Espace) est native : vérifiée dans le navigateur (e2e).
  it('s’ouvre et se referme sans JavaScript dédié', async () => {
    const { container } = render(
      <Accordion
        items={[
          {
            id: 'livraison',
            title: 'Livrez-vous à domicile ?',
            content: <p>Oui, en Île-de-France.</p>,
          },
          { id: 'paiement', title: 'Comment payer ?', content: <p>Par carte ou PayPal.</p> },
        ]}
      />,
    );
    const question = screen.getByText('Livrez-vous à domicile ?');
    const details = container.querySelector('details#livraison');
    expect(details).not.toHaveAttribute('open');
    await userEvent.click(question);
    expect(details).toHaveAttribute('open');
    await userEvent.click(question);
    expect(details).not.toHaveAttribute('open');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('États', () => {
  it('annonce une erreur et propose une action', () => {
    render(
      <ErrorState title="Le catalogue n’a pas pu être chargé." action={<Button>Réessayer</Button>}>
        Vérifiez votre connexion, puis réessayez.
      </ErrorState>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Le catalogue n’a pas pu être chargé.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('invite à agir quand c’est vide', () => {
    render(
      <EmptyState title="Votre panier est vide" action={<a href="/boutique">Voir les kits</a>} />,
    );
    expect(screen.getByRole('heading', { name: 'Votre panier est vide' })).toBeInTheDocument();
  });

  it('garde une région annoncée même vide', () => {
    const { rerender } = render(<FormStatus tone="succes" />);
    const region = screen.getByRole('status');
    rerender(<FormStatus tone="succes">Votre demande est envoyée.</FormStatus>);
    expect(region).toHaveTextContent('Votre demande est envoyée.');
  });
});
