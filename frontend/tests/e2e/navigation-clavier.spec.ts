import { dismissConsent, expect, test } from './fixtures';

/** Parcours 4 du cahier des charges : navigation mobile au clavier. */
test.describe('Navigation mobile au clavier', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/');
    // Page interactive (hydratée) avant les touches : sinon Entrée peut tomber dans le vide.
    await page.waitForLoadState('networkidle');
  });

  test('le menu s’ouvre, retient le focus, se ferme à Échap et rend le focus', async ({ page }) => {
    const openButton = page.getByRole('button', { name: 'Ouvrir le menu' });
    await openButton.focus();
    await page.keyboard.press('Enter');

    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Traiteur' })).toBeVisible();

    // Piège de focus : après de nombreuses tabulations, le focus reste dans le menu.
    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press('Tab');
      const insideMenu = await page.evaluate(
        () => document.activeElement?.closest('dialog[open]') !== null,
      );
      // Le focus peut passer par la barre du navigateur : on tolère « rien de focalisé ».
      const onBody = await page.evaluate(() => document.activeElement === document.body);
      expect(insideMenu || onBody).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(openButton).toBeFocused();
  });

  test('chaque cible tactile du menu mesure au moins 44 px', async ({ page }) => {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    for (const target of await menu.locator('a, button').all()) {
      const box = await target.boundingBox();
      // Arrondi : le moteur renvoie parfois 43,99999 px pour une hauteur CSS de 44 px.
      expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
    }
  });

  test('choisir une rubrique ferme le menu et y conduit', async ({ page }) => {
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await page
      .getByRole('dialog', { name: 'Menu' })
      .getByRole('link', { name: 'Boutique' })
      .click();
    await expect(page).toHaveURL(/\/boutique$/);
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden();
  });

  test('le focus est toujours visible', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
  });
});
