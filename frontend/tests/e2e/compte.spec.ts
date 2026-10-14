import type { Page } from '@playwright/test';
import { dismissConsent, expect, seriousA11yViolations, test } from './fixtures';

/** Comptes de l'API factice : voir tests/mock-api/auth.mts. */
const PASSWORD = 'MotDePasse-Solide-2026';

function emailFor(prefix = 'awa') {
  return `${prefix}-${test.info().testId}-${test.info().project.name}@exemple.fr`;
}

async function login(page: Page, email: string, path = '/connexion') {
  await page.goto(path);
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test.describe('Connexion et protection de l’espace membre', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('sans session, l’espace membre redirige vers la connexion avec retour', async ({ page }) => {
    await page.goto('/espace-membre/profil');
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fespace-membre%2Fprofil$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Se connecter');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('les pages de compte ont une CSP à nonce, sans script en ligne autorisé', async ({
    page,
  }) => {
    const response = await page.goto('/connexion');
    const csp = response!.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("'unsafe-inline' ");
    expect(response!.headers()['cache-control']).toContain('no-store');
    // L'hydratation fonctionne sous cette CSP : le bouton « Afficher » répond.
    await page.getByRole('button', { name: 'Afficher le mot de passe' }).click();
    await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveAttribute('type', 'text');
  });

  test('identifiants incorrects : message générique, champ mot de passe vidé', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(emailFor());
    await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'E-mail ou mot de passe incorrect.',
    );
    await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveValue('');
  });

  test('connexion : retour à la page demandée, session gardée au rechargement', async ({
    page,
  }) => {
    await page.goto('/espace-membre/adresses');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(emailFor());
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/espace-membre\/adresses$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes adresses');
    await expect(page.getByRole('link', { name: /Mon espace/ }).first()).toBeAttached();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes adresses');
    // Le jeton d'accès n'est stocké nulle part dans le navigateur.
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(stored).not.toContain('acces-');
  });

  test('l’adresse de retour ne peut pas mener hors du site', async ({ page }) => {
    await login(page, emailFor(), '/connexion?retour=//site-pirate.example/vol');
    await expect(page).toHaveURL(/\/espace-membre$/);
  });

  test('plusieurs onglets : un seul renouvellement à la fois, aucune déconnexion', async ({
    context,
    page,
    request,
  }) => {
    await login(page, emailFor());
    await expect(page).toHaveURL(/\/espace-membre$/);
    const second = await context.newPage();
    const third = await context.newPage();
    // Trois onglets restaurent la session en même temps : sans coordination, la rotation des
    // jetons ferait révoquer toute la session par l'API.
    await Promise.all([
      second.goto('/espace-membre/profil'),
      third.goto('/espace-membre/securite'),
      page.reload(),
    ]);
    await expect(second.getByRole('heading', { level: 1 })).toHaveText('Mon profil');
    await expect(third.getByRole('heading', { level: 1 })).toHaveText('Sécurité');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon espace');
    await expect(second.getByRole('textbox', { name: 'Prénom' })).toHaveValue('Awa');
    expect(
      (await (await request.get('http://localhost:3999/__mock/stats')).json()).refreshCount,
    ).toBeGreaterThan(0);
  });

  test('la déconnexion s’applique à tous les onglets', async ({ context, page }) => {
    await login(page, emailFor());
    await expect(page).toHaveURL(/\/espace-membre$/);
    const second = await context.newPage();
    await second.goto('/espace-membre/profil');
    await expect(second.getByRole('heading', { level: 1 })).toHaveText('Mon profil');

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(second).toHaveURL(/\/connexion\?retour=/);
    await page.goto('/espace-membre');
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('e-mail non confirmé : explication et renvoi du lien', async ({ page }) => {
    await login(page, emailFor('nonverifie'));
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Confirmez d’abord');
    await page.getByRole('button', { name: 'Renvoyer l’e-mail de confirmation' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('un e-mail vient');
  });

  test('administration : second facteur, code faux puis juste', async ({ page }) => {
    await login(page, emailFor('admin'));
    const code = page.getByRole('textbox', { name: 'Code de vérification' });
    await code.fill('000000');
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Code incorrect');
    await code.fill('123456');
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(page).toHaveURL(/\/espace-membre$/);
  });

  test('administration, première connexion : configuration puis codes de secours', async ({
    page,
  }) => {
    await login(page, emailFor('nouvel-admin'));
    await expect(page.getByText('JBSWY3DPEHPK3PXP')).toBeVisible();
    await page.getByRole('textbox', { name: 'Code de vérification' }).fill('123456');
    await page.getByRole('button', { name: 'Valider le code' }).click();
    await expect(
      page.getByRole('list', { name: 'Codes de secours' }).getByRole('listitem'),
    ).toHaveCount(4);
    await page.getByRole('button', { name: 'J’ai noté mes codes, continuer' }).click();
    await expect(page).toHaveURL(/\/espace-membre$/);
  });
});

test.describe('Inscription et liens reçus par e-mail', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('inscription : règles du mot de passe et des conditions, puis confirmation', async ({
    page,
  }) => {
    await page.goto('/inscription');
    await page.getByRole('textbox', { name: 'Prénom' }).fill('Awa');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(emailFor());
    await page.getByLabel('Mot de passe', { exact: true }).fill('court');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(
      page.getByText('Choisissez un mot de passe d’au moins 12 caractères.'),
    ).toBeVisible();
    await expect(page.getByText('Acceptez les conditions pour créer votre compte.')).toBeVisible();
    await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await page.getByRole('checkbox', { name: /J’accepte les conditions générales/ }).check();
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('Ouvrez le lien reçu');
  });

  test('activation du compte à l’ouverture du lien, jeton retiré de l’adresse', async ({
    page,
  }) => {
    await page.goto('/verifier-email?token=jeton-valide');
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Votre adresse est confirmée',
    );
    await expect(page).toHaveURL(/\/verifier-email$/);
    await expect(page.getByRole('link', { name: 'Se connecter' }).last()).toBeVisible();
  });

  test('nouveau mot de passe : confirmation identique exigée, lien expiré expliqué', async ({
    page,
  }) => {
    await page.goto('/reinitialiser?token=perime');
    await page.getByLabel('Nouveau mot de passe').fill(PASSWORD);
    await page.getByLabel('Confirmez le mot de passe').fill(`${PASSWORD}!`);
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click();
    await expect(page.getByText('Les deux mots de passe ne sont pas identiques.')).toBeVisible();
    await page.getByLabel('Confirmez le mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Enregistrer mon mot de passe' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('n’est plus valide');
  });

  test('mot de passe oublié : même réponse que le compte existe ou non', async ({ page }) => {
    await page.goto('/mot-de-passe-oublie');
    await page.getByRole('textbox', { name: 'Adresse e-mail du compte' }).fill(emailFor('inconnu'));
    await page.getByRole('button', { name: 'Recevoir le lien' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText(
      'Si un compte correspond à cette adresse',
    );
  });
});

test.describe('Espace membre', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
    await login(page, emailFor());
    await expect(page).toHaveURL(/\/espace-membre$/);
  });

  test('profil : modification enregistrée et retrouvée après rechargement', async ({ page }) => {
    await page
      .getByRole('navigation', { name: 'Mon espace' })
      .getByRole('link', { name: 'Mon profil' })
      .click();
    const firstName = page.getByRole('textbox', { name: 'Prénom' });
    await expect(firstName).toHaveValue('Awa');
    await firstName.fill('Aminata');
    await page.getByRole('textbox', { name: 'Téléphone' }).fill('06 12 34 56 78');
    await page.getByRole('button', { name: 'Enregistrer mes informations' }).click();
    await expect(page.getByRole('main').getByRole('status').first()).toContainText('enregistrées');
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Prénom' })).toHaveValue('Aminata');
  });

  test('adresses : ajout, modification, suppression', async ({ page }) => {
    await page.goto('/espace-membre/adresses');
    await expect(page.getByText('Aucune adresse pour le moment')).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter une adresse' }).click();
    await page.getByRole('button', { name: 'Ajouter l’adresse' }).click();
    await expect(page.getByText('Indiquez l’adresse.')).toBeVisible();
    await page.getByRole('textbox', { name: 'Prénom' }).fill('Awa');
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Diallo');
    await page.getByRole('textbox', { name: 'Adresse', exact: true }).fill('12 rue des Lilas');
    await page.getByRole('textbox', { name: 'Code postal' }).fill('94000');
    await page.getByRole('textbox', { name: 'Ville' }).fill('Créteil');
    await page.getByRole('button', { name: 'Ajouter l’adresse' }).click();
    await expect(page.getByText('Awa Diallo · 12 rue des Lilas, 94000 Créteil, FR')).toBeVisible();

    await page.getByRole('button', { name: /Modifier/ }).click();
    await page.getByRole('textbox', { name: 'Ville' }).fill('Paris');
    await page.getByRole('button', { name: 'Enregistrer l’adresse' }).click();
    await expect(page.getByText('Awa Diallo · 12 rue des Lilas, 94000 Paris, FR')).toBeVisible();

    await page.getByRole('button', { name: /Supprimer/ }).click();
    await expect(page.getByText('Aucune adresse pour le moment')).toBeVisible();
  });

  test('sécurité : appareil courant signalé, mauvais mot de passe actuel refusé', async ({
    page,
  }) => {
    await page.goto('/espace-membre/securite');
    await expect(page.getByText('Cet appareil')).toBeVisible();
    await page.getByLabel('Mot de passe actuel').fill('pas-le-bon-mot-de-passe');
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('Un-Nouveau-Mot-2026');
    await page.getByLabel('Confirmez le nouveau mot de passe').fill('Un-Nouveau-Mot-2026');
    await page.getByRole('button', { name: 'Changer mon mot de passe' }).click();
    await expect(page.getByText('mot de passe actuel incorrect')).toBeVisible();
  });

  test('données : suppression du compte confirmée par mot de passe', async ({ page }) => {
    await page.goto('/espace-membre/donnees');
    await expect(page.getByRole('button', { name: 'Télécharger mes données' })).toBeVisible();
    await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
    const dialog = page.getByRole('dialog', { name: 'Supprimer définitivement mon compte ?' });
    await dialog.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Oui, supprimer mon compte' }).click();
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('téléchargement de l’export des données', async ({ page }) => {
    await page.goto('/espace-membre/donnees');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger mes données' }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^mes-donnees-les-secrets-de-diani-.*\.json$/,
    );
  });

  test('aucune violation d’accessibilité grave dans l’espace membre @a11y', async ({ page }) => {
    for (const path of [
      '/espace-membre',
      '/espace-membre/profil',
      '/espace-membre/adresses',
      '/espace-membre/securite',
      '/espace-membre/donnees',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await seriousA11yViolations(page), path).toEqual([]);
    }
  });
});

test('aucune violation d’accessibilité grave sur les pages de compte @a11y', async ({ page }) => {
  await dismissConsent(page);
  for (const path of [
    '/connexion',
    '/inscription',
    '/mot-de-passe-oublie',
    '/reinitialiser?token=x',
  ]) {
    await page.goto(path);
    expect(await seriousA11yViolations(page), path).toEqual([]);
  }
});
