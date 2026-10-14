import { dismissConsent, expect, test } from './fixtures';

/** Parcours 1 du cahier des charges : visiteur → demande traiteur / WhatsApp. */
test.describe('Traiteur', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/traiteur');
  });

  test('présente plateaux, à la carte et layer cakes avec compositions, prix et conditions', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Traiteur & commandes');
    await expect(page.getByRole('heading', { level: 2, name: 'Plateaux' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'À la carte' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Layer cakes' })).toBeVisible();
    const platter = page.getByRole('article').filter({ hasText: 'Plateau découverte' });
    await expect(platter).toContainText('5 mini burgers');
    await expect(platter).toContainText('40,00 €');
    const conditions = page.getByRole('region', { name: 'Comment commander' });
    await expect(conditions).toContainText('Un acompte de 10,00 €');
    await expect(conditions).toContainText('n’est pas remboursable');
    await expect(page.getByRole('region', { name: 'Ce qu’en disent nos clients' })).toBeVisible();
  });

  test('« Contacter » ouvre WhatsApp avec un message pré-rempli sur le produit', async ({
    page,
  }) => {
    const platter = page.getByRole('article').filter({ hasText: 'Plateau découverte' });
    const link = platter.getByRole('link', { name: /Contacter/ });
    await expect(link).toHaveAttribute('target', '_blank');
    const href = new URL((await link.getAttribute('href'))!);
    expect(href.hostname).toBe('wa.me');
    expect(href.searchParams.get('text')).toContain('Plateau découverte');
  });

  test('layer cake : la taille change le prix, les parfums sont limités et repris dans le message', async ({
    page,
  }) => {
    const cake = page.getByRole('article').filter({ hasText: 'Layer cake' });
    await cake.getByRole('radio', { name: /6–8 parts/ }).check();
    await expect(cake.getByText('Prix pour la taille choisie')).toBeAttached();
    await expect(cake.locator('[aria-live="polite"]')).toContainText('50,00 €');
    for (const name of ['Vanille', 'Fraise', 'Framboise']) {
      await cake.getByRole('checkbox', { name }).check();
    }
    await expect(cake.getByRole('checkbox', { name: 'Mangue-passion' })).toBeDisabled();
    const href = new URL(
      (await cake.getByRole('link', { name: /Contacter/ }).getAttribute('href'))!,
    );
    expect(href.searchParams.get('text')).toContain(
      'Layer cake (6–8 parts), parfums : vanille, fraise et framboise',
    );
  });

  test('demande personnalisée : sélection, estimation, acompte puis accusé de réception', async ({
    page,
  }) => {
    const cake = page.getByRole('article').filter({ hasText: 'Layer cake' });
    await cake.getByRole('radio', { name: /4–6 parts/ }).check();
    await cake.getByRole('checkbox', { name: 'Fraise' }).check();
    await cake.getByRole('button', { name: 'Ajouter à ma demande' }).click();
    await expect(cake.getByRole('status')).toContainText('ajouté à votre demande');

    const form = page.locator('#demande');
    const selection = form.getByRole('region', { name: 'Votre sélection' });
    await expect(selection).toContainText('Layer cake (4–6 parts), parfum : fraise');
    await expect(selection).toContainText('Estimation : 35,00 €');
    await expect(selection).toContainText('Acompte à prévoir : 10,00 €');
    await selection.getByRole('spinbutton', { name: /Quantité/ }).fill('2');
    await expect(selection).toContainText('Estimation : 70,00 €');
    await expect(selection).toContainText('Acompte à prévoir : 20,00 €');

    // Erreurs avant l'envoi : champs obligatoires, en français, focus sur le premier.
    await form.getByRole('button', { name: 'Envoyer ma demande' }).click();
    await expect(form.getByRole('textbox', { name: 'Votre prénom' })).toBeFocused();
    await expect(form.getByText('Indiquez votre prénom.')).toBeVisible();
    await expect(form.getByText('Indiquez la date de votre événement.')).toBeVisible();

    await form.getByRole('textbox', { name: 'Votre prénom' }).fill('Awa');
    await form.getByRole('textbox', { name: 'Votre e-mail' }).fill('awa@exemple.fr');
    const date = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await form.getByLabel('Date de l’événement').fill(date);
    await form.getByRole('spinbutton', { name: /Nombre d’invités/ }).fill('30');
    await form.getByRole('radio', { name: 'Je souhaite une livraison' }).check();
    await form.getByRole('button', { name: 'Envoyer ma demande' }).click();
    await expect(form.getByText('Indiquez la ville ou l’adresse de livraison.')).toBeVisible();
    await form.getByRole('textbox', { name: 'Ville ou adresse de livraison' }).fill('Créteil');
    await form.getByRole('button', { name: 'Envoyer ma demande' }).click();

    const receipt = form.getByRole('status').filter({ hasText: 'TR-000042' });
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText('Estimation de votre sélection : 70,00 €');
    await expect(form.getByRole('link', { name: /Poursuivre sur WhatsApp/ })).toBeVisible();
  });

  test('une date trop proche est refusée avant l’envoi', async ({ page }) => {
    const form = page.locator('#demande');
    await form.getByRole('textbox', { name: 'Votre prénom' }).fill('Awa');
    await form.getByRole('textbox', { name: 'Votre e-mail' }).fill('awa@exemple.fr');
    await form.getByLabel('Date de l’événement').fill(new Date().toISOString().slice(0, 10));
    await form.getByRole('button', { name: 'Envoyer ma demande' }).click();
    await expect(form.getByText(/Choisissez une date à partir du/)).toBeVisible();
  });
});
