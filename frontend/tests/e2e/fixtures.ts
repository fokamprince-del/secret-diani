import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

/**
 * Chaque test échoue si le navigateur signale une violation de CSP ou une erreur JavaScript :
 * la politique stricte est ainsi vérifiée sur chaque page visitée.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      // Les 404 volontaires et l'API absente en local ne comptent pas.
      const relevant = errors.filter(
        (text) => !/status of 404|Failed to load resource|ERR_CONNECTION_REFUSED/.test(text),
      );
      expect(relevant, 'erreurs console (CSP, JavaScript)').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Choix « Refuser » pré-enregistré : le bandeau ne masque pas la page pendant le test. */
export async function dismissConsent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'diani-consent',
      JSON.stringify({ analytics: false, decidedAt: new Date().toISOString(), version: 1 }),
    );
  });
}

/** Violations axe graves ou critiques (WCAG 2.2 AA). */
export async function seriousA11yViolations(page: Page) {
  // On juge l'état au repos : les entrées animées (fondu du hero) sont d'abord terminées.
  // Les animations sans fin (squelettes de chargement) et celles liées au défilement (barre de
  // progression, parallaxe) ne sont pas attendues.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline === document.timeline &&
            animation.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((animation) => animation.finished),
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id} : ${violation.help} → ${violation.nodes
          .map((node) => `${node.target.join(' ')} (${node.any[0]?.message ?? ''})`)
          .join(' ; ')}`,
    );
}

/** Aucun défilement horizontal de la page. */
export async function hasHorizontalScroll(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}
