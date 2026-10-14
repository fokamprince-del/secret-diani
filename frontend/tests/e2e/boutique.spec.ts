import type { Page } from '@playwright/test';
import {
  dismissConsent,
  expect,
  hasHorizontalScroll,
  seriousA11yViolations,
  test,
} from './fixtures';

const PASSWORD = 'MotDePasse-Solide-2026';
const emailFor = (prefix = 'cliente') =>
  `${prefix}-${test.info().testId}-${test.info().project.name}@exemple.fr`;

async function addKit(page: Page, slug = 'kit-debutant') {
  await page.goto(`/boutique/${slug}`);
  await page.getByRole('button', { name: 'Ajouter au panier' }).click();
  await expect(
    page.getByRole('main').getByRole('status').filter({ hasText: 'ajouté au panier' }),
  ).toBeVisible();
}

async function fillDelivery(page: Page, { guest = true } = {}) {
  if (guest) await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(emailFor());
  await page.getByRole('textbox', { name: 'Prénom', exact: true }).fill('Awa');
  await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Diallo');
  await page.getByRole('radio', { name: /Colissimo/ }).check();
  await page.getByRole('textbox', { name: 'Adresse', exact: true }).fill('12 rue des Lilas');
  await page.getByRole('textbox', { name: 'Code postal', exact: true }).fill('94000');
  await page.getByRole('textbox', { name: 'Ville', exact: true }).fill('Créteil');
  await page.getByRole('checkbox', { name: /conditions générales de vente/ }).check();
}

test.describe('Boutique', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('liste des kits, disponibilité en mots et tableau comparatif', async ({ page }) => {
    await page.goto('/boutique');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Boutique & kits');
    const kits = page.getByRole('region', { name: 'Les kits' });
    await expect(kits.getByRole('article')).toHaveCount(3);
    await expect(kits.getByRole('article').filter({ hasText: 'Kit Débutant' })).toContainText(
      '37,99 €',
    );
    await expect(kits.getByRole('article').filter({ hasText: 'Kit Expert' })).toContainText(
      'Plus que 2 en stock',
    );
    await expect(kits.getByRole('article').filter({ hasText: 'Kit Pro Atelier' })).toContainText(
      'Épuisé',
    );
    const table = page.getByRole('table', { name: 'Ce que contient chaque kit' });
    await expect(table.getByRole('columnheader', { name: /Kit Expert/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /Plateau tournant/ })).toContainText('Non inclus');
  });

  test('fiche : composition, données structurées, ajout au panier et badge', async ({ page }) => {
    await page.goto('/boutique/kit-debutant');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kit Débutant');
    await expect(page.getByRole('region', { name: 'Dans ce kit' })).toContainText('Spatule coudée');
    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? '{}')['@type']));
    expect(types).toContain('Product');
    await expect(page.getByRole('link', { name: /Panier/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ajouter un' }).click();
    await page.getByRole('button', { name: 'Ajouter au panier' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Kit Débutant ajouté au panier.',
    );
    await expect(page.getByRole('link', { name: 'Panier, 2 articles' })).toBeVisible();
  });

  test('produit épuisé : pas d’ajout possible, explication', async ({ page }) => {
    await page.goto('/boutique/kit-pro-atelier');
    await expect(page.getByText('Épuisé pour le moment : revenez bientôt.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter au panier' })).toHaveCount(0);
  });

  test('le stock plafonne la quantité : message de l’API', async ({ page }) => {
    await page.goto('/boutique/kit-expert');
    await page.getByRole('button', { name: 'Ajouter un' }).click();
    await expect(page.getByRole('button', { name: 'Ajouter un' })).toBeDisabled();
    await page.getByRole('button', { name: 'Ajouter au panier' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('ajouté au panier');
    await page.getByRole('button', { name: 'Ajouter au panier' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Quantité maximale atteinte',
    );
  });

  test('panier : quantités modifiées par le serveur, retrait, panier vide', async ({ page }) => {
    await addKit(page);
    await page.goto('/panier');
    const line = page.getByRole('listitem').filter({ hasText: 'Kit Débutant' });
    await expect(line).toContainText('37,99 €');
    await line.getByRole('combobox', { name: 'Quantité de Kit Débutant' }).selectOption('3');
    await expect(line).toContainText('113,97 €');
    await expect(page.getByRole('complementary', { name: 'Récapitulatif' })).toContainText(
      'Offerte',
    );
    await line.getByRole('button', { name: 'Retirer Kit Débutant' }).click();
    await expect(page.getByRole('heading', { name: 'Votre panier est vide' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Panier,/ })).toHaveCount(0);
  });
});

test.describe('Commande et paiement', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('invité : commande, paiement par carte, confirmation, suivi et facture', async ({
    page,
  }) => {
    await addKit(page);
    await page.goto('/panier');
    await page.getByRole('link', { name: 'Commander' }).click();
    await expect(page).toHaveURL(/\/commande$/);
    await fillDelivery(page);
    const recap = page.getByRole('complementary', { name: 'Votre commande' });
    await expect(recap).toContainText('44,89 €');
    await page.getByRole('button', { name: 'Payer 44,89 €' }).click();

    // Page de paiement hébergée (factice) : aucune donnée de carte ne passe par le site.
    await expect(page.getByRole('heading', { name: /Paiement factice \(stripe\)/ })).toBeVisible();
    await page.getByRole('link', { name: 'Payer' }).click();

    await expect(page).toHaveURL(/\/commande\/succes$/);
    await expect(page.getByRole('main').getByRole('status').first()).toContainText(
      'Votre paiement de 44,89 € est confirmé',
    );
    await expect(page.getByText('Paiement reçu')).toBeVisible();
    await expect(page.getByRole('link', { name: /Panier,/ })).toHaveCount(0);

    await page.getByRole('link', { name: 'Lien de suivi de la commande' }).click();
    await expect(page).toHaveURL(/\/commande\/suivi$/);
    await expect(page.getByRole('main')).toContainText('Payée');
    await expect(page.getByRole('button', { name: 'Télécharger la facture' })).toBeVisible();
  });

  test('sans moyen de paiement configuré : explication, bouton désactivé', async ({ page }) => {
    await page.route('**/api/v1/payments/methods', (route) =>
      route.fulfill({ json: { stripe: false, paypal: false } }),
    );
    await addKit(page);
    await page.goto('/commande');
    await expect(
      page.getByText(/Le paiement en ligne est momentanément indisponible/),
    ).toBeVisible();
    await expect(page.getByRole('radio', { name: /Carte bancaire|PayPal/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Payer/ })).toBeDisabled();
  });

  test('PayPal seul : proposé et choisi par défaut', async ({ page }) => {
    await page.route('**/api/v1/payments/methods', (route) =>
      route.fulfill({ json: { stripe: false, paypal: true } }),
    );
    await addKit(page);
    await page.goto('/commande');
    await expect(page.getByRole('radio', { name: /PayPal/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /Carte bancaire/ })).toHaveCount(0);
  });

  test('retrait : l’adresse de facturation est demandée ; CGV obligatoires', async ({ page }) => {
    await addKit(page);
    await page.goto('/commande');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(emailFor());
    await page.getByRole('textbox', { name: 'Prénom', exact: true }).fill('Awa');
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Diallo');
    await page.getByRole('radio', { name: /Retrait à l’atelier/ }).check();
    await page.getByRole('button', { name: /^Payer/ }).click();
    await expect(page.getByText('Indiquez le nom pour la facture.')).toBeVisible();
    await expect(
      page.getByText('Acceptez les conditions générales de vente pour commander.'),
    ).toBeVisible();
  });

  test('paiement annulé puis repris avec PayPal', async ({ page }) => {
    await addKit(page);
    await page.goto('/commande');
    await fillDelivery(page);
    await page.getByRole('button', { name: /^Payer/ }).click();
    await page.getByRole('link', { name: 'Annuler' }).click();

    await expect(page).toHaveURL(/\/commande\/annule$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement annulé');
    await expect(page.getByText(/reste réservée jusqu’à/)).toBeVisible();
    await page.getByRole('button', { name: 'Payer avec PayPal' }).click();
    await expect(page.getByRole('heading', { name: /Paiement factice \(paypal\)/ })).toBeVisible();
    await page.getByRole('link', { name: 'Payer' }).click();
    await expect(page.getByRole('main').getByRole('status').first()).toContainText('est confirmé');
  });

  test('connectée : le panier invité rejoint le compte, la commande apparaît dans l’espace', async ({
    page,
  }) => {
    await addKit(page);
    await page.goto('/connexion?retour=/panier');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(emailFor('compte'));
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/panier$/);
    await expect(page.getByRole('listitem').filter({ hasText: 'Kit Débutant' })).toBeVisible();

    await page.getByRole('link', { name: 'Commander' }).click();
    await expect(page.getByText(/Commande rattachée à votre compte/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Adresse e-mail' })).toHaveCount(0);
    await fillDelivery(page, { guest: false });
    await page.getByRole('button', { name: /^Payer/ }).click();
    await page.getByRole('link', { name: 'Payer' }).click();
    await expect(page.getByRole('main').getByRole('status').first()).toContainText('est confirmé');

    await page.goto('/espace-membre/commandes');
    await page
      .getByRole('link', { name: /Commande CMD-/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Détail de la commande');
    await expect(page.getByRole('main')).toContainText('Kit Débutant');
  });

  test('panier et commande : CSP à nonce, accessibilité, aucun défilement horizontal @a11y', async ({
    page,
  }) => {
    await addKit(page);
    const response = await page.goto('/panier');
    expect(response!.headers()['content-security-policy']).toContain("'strict-dynamic'");
    for (const path of ['/boutique', '/boutique/kit-expert', '/panier', '/commande']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await seriousA11yViolations(page), path).toEqual([]);
    }
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ['/boutique', '/panier', '/commande']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await hasHorizontalScroll(page), path).toBe(false);
    }
  });
});
