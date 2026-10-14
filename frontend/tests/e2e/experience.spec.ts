import { dismissConsent, expect, test } from './fixtures';

/** Phase 7 : mouvement réduit, hors ligne, partage, données structurées, clavier, cibles tactiles. */
test.describe('Expérience et accessibilité transverses', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('mouvement réduit : aucune animation d’entrée, contenu visible au repos', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toBeVisible();
    expect(await title.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    ).toBe('auto');
    await context.close();
  });

  test('hors ligne : bandeau explicite, puis confirmation au retour de la connexion', async ({
    context,
    page,
  }) => {
    await page.goto('/conseils');
    await context.setOffline(true);
    await expect(page.getByText(/Vous êtes hors ligne/)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText('Connexion rétablie.')).toBeVisible();
    await expect(page.getByText('Connexion rétablie.')).toBeHidden({ timeout: 8000 });
  });

  test('image de partage par défaut, servie en PNG', async ({ page, request }) => {
    await page.goto('/');
    const image = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(image).toBeTruthy();
    const response = await request.get(new URL(image!).pathname + new URL(image!).search);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    await page.goto('/conseils/reussir-sa-creme-au-beurre');
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute(
      'content',
      /opengraph-image/,
    );
  });

  test('fil d’Ariane en données structurées (produit, article, formation) et site sur l’accueil', async ({
    page,
  }) => {
    const types = async () =>
      page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? '{}')));
    await page.goto('/');
    expect((await types()).map((data) => data['@type'])).toEqual(
      expect.arrayContaining(['WebSite', 'Organization']),
    );
    for (const path of [
      '/boutique/kit-debutant',
      '/conseils/reussir-sa-creme-au-beurre',
      '/formations/creme-au-beurre',
    ]) {
      await page.goto(path);
      const crumbs = (await types()).find((data) => data['@type'] === 'BreadcrumbList');
      expect(crumbs, path).toBeDefined();
      expect(crumbs.itemListElement[0].name).toBe('Accueil');
      expect(crumbs.itemListElement.at(-1).item).toContain(path);
    }
  });

  test('clavier seul : ajout au panier et confirmation annoncée', async ({ page }) => {
    await page.goto('/boutique/kit-debutant');
    const add = page.getByRole('button', { name: 'Ajouter au panier' });
    // On part du titre et on avance à la tabulation jusqu'au bouton.
    await page.getByRole('heading', { level: 1 }).click();
    for (
      let i = 0;
      i < 12 && !(await add.evaluate((node) => node === document.activeElement));
      i += 1
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(add).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main').getByRole('status')).toContainText('ajouté au panier');
  });

  test('cibles tactiles d’au moins 44 px sur mobile (boutons et champs)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/traiteur', '/contact', '/boutique/kit-debutant', '/connexion']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const small = await page
        .locator(
          'main button:visible, main input:not([type="checkbox"]):not([type="radio"]):visible, main select:visible',
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => !node.closest('[aria-hidden="true"]'))
            .map((node) => ({
              label: node.textContent?.trim() || node.getAttribute('name') || node.tagName,
              height: node.getBoundingClientRect().height,
            }))
            .filter((entry) => Math.round(entry.height) < 44),
        );
      expect(small, path).toEqual([]);
    }
  });

  test('toute image porte un texte alternatif (vide si décorative)', async ({ page }) => {
    for (const path of ['/', '/traiteur', '/boutique', '/formations', '/conseils']) {
      await page.goto(path);
      const missing = await page.locator('img:not([alt])').count();
      expect(missing, path).toBe(0);
    }
  });
});
