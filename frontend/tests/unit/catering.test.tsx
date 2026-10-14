import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ProductOptions } from '@/components/catering/ProductOptions';
import { SelectionProvider, useSelection } from '@/components/catering/SelectionProvider';
import {
  depositFor,
  describeChoice,
  isoDateIn,
  selectionKey,
  selectionTotal,
  whatsappWithMessage,
} from '@/lib/catering';
import { cateringCatalog, cateringConditions } from '../mock-api/fixtures.mts';
import { axeViolations } from './axe';

const cake = cateringCatalog.categories[2]!.products[0]!;
const rule = cateringConditions.deposit;

function SelectionCount() {
  const { items } = useSelection();
  return <p data-testid="nombre">{items.reduce((sum, item) => sum + item.quantity, 0)}</p>;
}

describe('règles du traiteur', () => {
  it('acompte : 10 € sous 50 €, 20 € à partir de 50 €', () => {
    expect(depositFor(4_999, rule)).toBe(1_000);
    expect(depositFor(5_000, rule)).toBe(2_000);
  });

  it('décrit un choix en français', () => {
    expect(describeChoice('Layer cake', '6–8 parts', ['Vanille', 'Fraise', 'Framboise'])).toBe(
      'Layer cake (6–8 parts), parfums : vanille, fraise et framboise',
    );
    expect(describeChoice('Pastels', undefined, [])).toBe('Pastels');
  });

  it('remplace le message WhatsApp, refuse un lien qui n’est pas wa.me', () => {
    const url = whatsappWithMessage('https://wa.me/33612345678?text=a', 'Bonjour & merci');
    expect(new URL(url!).searchParams.get('text')).toBe('Bonjour & merci');
    expect(whatsappWithMessage('https://evil.example/?text=a', 'x')).toBeNull();
    expect(whatsappWithMessage(null, 'x')).toBeNull();
  });

  it('la clé de sélection ignore l’ordre des parfums', () => {
    expect(selectionKey('v1', ['b', 'a'])).toBe(selectionKey('v1', ['a', 'b']));
  });

  it('total indicatif et date minimale', () => {
    expect(
      selectionTotal([
        { priceCents: 1_500, quantity: 2 },
        { priceCents: 3_500, quantity: 1 },
      ] as never),
    ).toBe(6_500);
    expect(isoDateIn(2, new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-16');
  });
});

describe('ProductOptions', () => {
  it('limite le nombre de parfums et ajoute la sélection à la demande', async () => {
    const { container } = render(
      <SelectionProvider>
        <ProductOptions {...cake} />
        <SelectionCount />
      </SelectionProvider>,
    );
    await userEvent.click(screen.getByRole('radio', { name: /8–10 parts/ }));
    for (const name of ['Vanille', 'Fraise', 'Framboise']) {
      await userEvent.click(screen.getByRole('checkbox', { name }));
    }
    expect(screen.getByRole('checkbox', { name: 'Kinder Bueno' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à ma demande' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter à ma demande' }));
    expect(screen.getByTestId('nombre')).toHaveTextContent('2');
    expect(screen.getByRole('status')).toHaveTextContent('ajouté à votre demande');
    expect(await axeViolations(container)).toEqual([]);
  }, 15_000);
});
