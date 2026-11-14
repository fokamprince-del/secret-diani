import type { Page } from '@playwright/test';
import {
  dismissConsent,
  expect,
  hasHorizontalScroll,
  seriousA11yViolations,
  test,
} from './fixtures';

const PASSWORD = 'MotDePasse-Solide-2026';
const email = (prefix: string) =>
  `${prefix}-${test.info().testId}-${test.info().project.name}@exemple.fr`;

async function loginAdmin(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email('admin'));
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('textbox', { name: 'Code de vérification' }).fill('123456');
  await page.getByRole('button', { name: 'Valider le code' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('Back-office', () => {
  test.beforeEach(async ({ page, request }) => {
    await request.get('http://localhost:3999/__mock/admin/reset');
    await dismissConsent(page);
  });

  test('sans session, /admin renvoie vers la connexion', async ({ page }) => {
    await page.goto('/admin/traiteur/demandes');
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fadmin%2Ftraiteur%2Fdemandes$/);
  });

  test('un compte client voit « Espace réservé »', async ({ page }) => {
    await page.goto('/connexion?retour=%2Fadmin');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email('cliente'));
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espace réservé');
  });

  test('tableau de bord, puis une demande traiteur suivie jusqu’à l’acompte', async ({ page }) => {
    await loginAdmin(page);
    // Le site public (en-tête, pied de page) laisse la place au back-office.
    await expect(page.locator('header[data-chrome-public]')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Administration' })).toBeVisible();
    await expect(page.getByText('Demandes traiteur à traiter')).toBeVisible();
    await expect(page.getByRole('cell', { name: /Awa Diallo/ }).first()).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Administration' })
      .getByRole('link', { name: 'Demandes & devis' })
      .click();
    await page.getByRole('link', { name: /Awa Diallo/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Awa Diallo');
    await expect(page.getByText('Mariage').first()).toBeVisible();

    await page.getByRole('button', { name: 'Marquer « contactée »' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'contactée' })).toBeVisible();

    await page.getByLabel('Total convenu (€)').fill('240');
    await page.getByRole('button', { name: 'Acompte reçu' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Acompte reçu' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Acompte enregistré' })).toBeVisible();
    await expect(page.getByText(/reçu le/)).toBeVisible();
  });

  test('carte : changer un prix et cocher les allergènes', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/traiteur/produits');
    await page.getByRole('link', { name: /Layer cake/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Layer cake');
    await page.getByLabel('Prix (€)').first().fill('16,50');
    await page.getByRole('checkbox', { name: 'Sésame' }).check();
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect(page.getByRole('status').filter({ hasText: 'Produit enregistré' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Prix (€)').first()).toHaveValue('16,50');
    await expect(page.getByRole('checkbox', { name: 'Sésame' })).toBeChecked();
  });

  test('téléphone : menu en tiroir, sans défilement horizontal, accessible @a11y', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAdmin(page);
    await expect(page.getByRole('navigation', { name: 'Administration' })).toBeHidden();
    await page.getByRole('button', { name: 'Menu de l’administration' }).click();
    await page
      .getByRole('navigation', { name: 'Administration' })
      .getByRole('link', { name: 'Paramètres du site' })
      .click();
    await expect(page).toHaveURL(/\/admin\/parametres$/);
    await expect(page.getByRole('navigation', { name: 'Administration' })).toBeHidden();
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(await seriousA11yViolations(page)).toEqual([]);
    await page.goto('/admin');
    await expect(page.getByText('Demandes traiteur à traiter')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(await seriousA11yViolations(page)).toEqual([]);
  });
});
