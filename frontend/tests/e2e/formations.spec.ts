import type { Page } from '@playwright/test';
import { dismissConsent, expect, seriousA11yViolations, test } from './fixtures';

const PASSWORD = 'MotDePasse-Solide-2026';
const emailFor = (prefix = 'eleve') =>
  `${prefix}-${test.info().testId}-${test.info().project.name}@exemple.fr`;

async function login(page: Page, email: string, retour = '/espace-membre') {
  await page.goto(`/connexion?retour=${encodeURIComponent(retour)}`);
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Achat d'un pack jusqu'au retour de paiement (page de paiement factice). */
async function buyPack(page: Page, pack: string, action: 'Payer' | 'Annuler' = 'Payer') {
  await page.goto(`/commande/pack/${pack}`);
  await page.getByRole('textbox', { name: 'Adresse', exact: true }).fill('12 rue des Lilas');
  await page.getByRole('textbox', { name: 'Code postal' }).fill('94000');
  await page.getByRole('textbox', { name: 'Ville' }).fill('Créteil');
  await page.getByRole('checkbox', { name: /conditions générales de vente/ }).check();
  await page.getByRole('button', { name: /^Payer/ }).click();
  await page.getByRole('link', { name: action }).click();
}

test.describe('Formations : catalogue', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('trois packs, formations phares, fonctionnement, leçon d’exemple', async ({ page }) => {
    await page.goto('/formations');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Formations en ligne');
    const packs = page.getByRole('region', { name: 'Les packs' });
    await expect(packs.getByRole('article')).toHaveCount(3);
    await expect(packs.getByRole('article', { name: 'Pack Essentiel' })).toContainText('29,99 €');
    await expect(packs.getByRole('article', { name: 'Pack Premium' })).toContainText('199,99 €');
    await expect(packs.getByRole('article', { name: 'Pack Intermédiaire' })).toContainText(
      '1 appel personnalisé',
    );
    await expect(
      page.getByRole('region', { name: 'Les formations phares' }).getByRole('article'),
    ).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Obtenez votre certificat' })).toBeVisible();
  });

  test('fiche formation : programme, pack requis, leçon offerte, données structurées', async ({
    page,
  }) => {
    await page.goto('/formations/creme-au-beurre');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crème au beurre');
    await expect(
      page.getByRole('heading', { name: 'Inclus dans le pack Essentiel' }),
    ).toBeVisible();
    await expect(page.getByText('Leçon offerte').first()).toBeVisible();
    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? '{}')['@type']));
    expect(types).toContain('Course');
  });

  test('leçon offerte sans compte : contenu visible, rien d’enregistré, pas de quiz', async ({
    page,
  }) => {
    await page.goto('/formations/creme-au-beurre/les-bases');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les bases');
    await expect(page.getByText('La vidéo est momentanément indisponible')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Conseils & astuces' })).toBeVisible();
    await expect(page.getByText(/Leçon offerte : créez un compte/)).toBeVisible();
    await expect(page.getByText('Fiche recette (PDF) : disponible avec le pack.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Leçon suivante/ })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('leçon payante sans accès : invitation claire à choisir le pack', async ({ page }) => {
    await page.goto('/formations/creme-au-beurre/la-technique');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Cette leçon fait partie d’une formation',
    );
    await expect(page.getByText('Cette leçon fait partie du pack Essentiel.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).toHaveAttribute(
      'href',
      '/connexion?retour=%2Fformations%2Fcreme-au-beurre%2Fla-technique',
    );
  });

  test('choisir un pack sans compte mène à la connexion, avec retour', async ({ page }) => {
    await page.goto('/formations');
    await page.getByRole('link', { name: 'Choisir ce pack Essentiel' }).click();
    await expect(page).toHaveURL(/\/connexion\?retour=%2Fcommande%2Fpack%2Fessentiel$/);
  });
});

test.describe('Formations : parcours complet', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('achat du pack → accès après paiement → leçon → quiz → certificat vérifiable', async ({
    page,
    request,
  }) => {
    const email = emailFor();
    await login(page, email);
    await expect(page).toHaveURL(/\/espace-membre$/);

    // Paiement annulé : aucun accès.
    await buyPack(page, 'essentiel', 'Annuler');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Paiement annulé');
    await page.goto('/formations/creme-au-beurre/la-technique');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Cette leçon fait partie d’une formation',
    );

    // Paiement confirmé : accès ouvert.
    await buyPack(page, 'essentiel');
    await expect(page.getByRole('main').getByRole('status').first()).toContainText(
      '29,99 € est confirmé',
    );
    await page.getByRole('link', { name: 'Accéder à mes formations' }).click();
    const course = page.getByRole('listitem').filter({ hasText: 'Crème au beurre' });
    await expect(
      course.getByRole('progressbar', { name: 'Progression dans Crème au beurre' }),
    ).toHaveAttribute('aria-valuenow', '0');
    await course.getByRole('link', { name: /Commencer/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les bases');
    await expect(
      page.getByText('Votre progression est enregistrée automatiquement.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Fiche recette/ })).toBeVisible();

    // Quiz : correction par l'API, explication, nouvel essai.
    await page.getByRole('link', { name: /Leçon suivante/ }).click();
    const quiz = page.getByRole('region', { name: 'Quiz' });
    await quiz.getByRole('button', { name: 'Valider mes réponses' }).click();
    await expect(quiz.getByRole('alert')).toContainText('il en reste 3');
    await quiz.getByRole('radio', { name: 'Fondu' }).check();
    await quiz.getByRole('checkbox', { name: 'Sucre glace' }).check();
    await quiz.getByRole('radio', { name: 'Quelques secondes' }).check();
    await quiz.getByRole('button', { name: 'Valider mes réponses' }).click();
    await expect(quiz.getByText('Score : 0 %')).toBeVisible();
    await expect(quiz.getByText('Un beurre pommade se fouette sans grumeaux')).toBeVisible();
    await quiz.getByRole('button', { name: 'Recommencer le quiz' }).click();
    await quiz.getByRole('radio', { name: 'Pommade, à température ambiante' }).check();
    await quiz.getByRole('checkbox', { name: 'Sucre glace' }).check();
    await quiz.getByRole('checkbox', { name: 'Sirop de sucre cuit' }).check();
    await quiz.getByRole('radio', { name: 'Environ 5 minutes' }).check();
    await quiz.getByRole('button', { name: 'Valider mes réponses' }).click();
    await expect(quiz.getByText(/Score : 100 %\. Quiz réussi/)).toBeVisible();

    // Toutes les vidéos vues (pas de vraie vidéo dans l'API factice), puis certificat.
    await request.post(
      `http://localhost:3999/__mock/terminer?email=${encodeURIComponent(email)}&formation=creme-au-beurre`,
    );
    await page.goto('/espace-membre/formations');
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Crème au beurre' }).getByRole('progressbar'),
    ).toHaveAttribute('aria-valuenow', '100');
    await page.getByRole('button', { name: 'Obtenir mon certificat' }).click();
    const certificates = page.getByRole('region', { name: 'Mes certificats' });
    await expect(certificates).toContainText(/N° CERT-2026-\d{4}/);
    await certificates.getByRole('link', { name: 'Page de vérification' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vérification de certificat');
    await expect(page.getByText(/Ce certificat est authentique/)).toBeVisible();
  });

  test('pack déjà détenu : achat refusé, lien vers mes formations', async ({ page }) => {
    await login(page, emailFor());
    await buyPack(page, 'intermediaire');
    await expect(page.getByRole('main').getByRole('status').first()).toContainText('est confirmé');
    await page.goto('/commande/pack/essentiel');
    await page.getByRole('textbox', { name: 'Adresse', exact: true }).fill('12 rue des Lilas');
    await page.getByRole('textbox', { name: 'Code postal' }).fill('94000');
    await page.getByRole('textbox', { name: 'Ville' }).fill('Créteil');
    await page.getByRole('checkbox', { name: /conditions générales de vente/ }).check();
    await page.getByRole('button', { name: /^Payer/ }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Vous avez déjà accès à ce pack.',
    );
  });

  test('avantages : demande d’appel personnalisé dans la limite du pack', async ({ page }) => {
    await login(page, emailFor());
    await buyPack(page, 'intermediaire');
    await page.goto('/espace-membre/formations');
    const perks = page.getByRole('region', { name: 'Mes avantages' });
    await expect(perks).toContainText('Appels personnalisés : 1 restant sur 1.');
    await perks
      .getByRole('textbox', { name: 'Demander un appel' })
      .fill('Mon buffet de juin, plutôt le soir.');
    await perks.getByRole('button', { name: 'Envoyer ma demande d’appel' }).click();
    await expect(perks.getByRole('status').first()).toContainText('Demande envoyée');
    await expect(perks).toContainText('Appels personnalisés : 0 restant sur 1.');
    await expect(perks.getByRole('button', { name: 'Envoyer ma demande d’appel' })).toHaveCount(0);
  });

  test('aucune violation d’accessibilité grave @a11y', async ({ page }) => {
    for (const path of [
      '/formations',
      '/formations/creme-au-beurre',
      '/formations/creme-au-beurre/les-bases',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await seriousA11yViolations(page), path).toEqual([]);
    }
    await login(page, emailFor());
    await buyPack(page, 'essentiel');
    await page.goto('/formations/creme-au-beurre/la-technique');
    await expect(page.getByRole('region', { name: 'Quiz' })).toBeVisible();
    expect(await seriousA11yViolations(page), 'leçon avec quiz').toEqual([]);
    await page.goto('/espace-membre/formations');
    await expect(page.getByRole('progressbar').first()).toBeVisible();
    expect(await seriousA11yViolations(page), 'mes formations').toEqual([]);
  });
});
