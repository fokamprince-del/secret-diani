import {
  dismissConsent,
  expect,
  hasHorizontalScroll,
  seriousA11yViolations,
  test,
} from './fixtures';

test.describe('Socle : gabarit, sécurité et accessibilité', () => {
  test('l’accueil a un seul h1, la langue française et un titre unique', async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page).toHaveTitle('Les Secrets de Diani · Traiteur, formations et boutique');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les Secrets de Diani');
    await expect(page.getByRole('link', { name: 'Commander maintenant' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      // Next retire la barre finale de la racine : « https://site » et « https://site/ » se valent.
      /^https?:\/\/[^/]+\/?$/,
    );
  });

  test('envoie les en-têtes de sécurité et une CSP sans script tiers', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response!.headers();
    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Pages statiques : scripts en ligne de Next autorisés, aucun fichier JS hors 'self' (D-F05).
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'(;| https)/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['x-powered-by']).toBeUndefined();
    // Aucun script tiers ; les scripts d'amorçage de Next portent une empreinte (SRI).
    // Next ne signe pas les morceaux propres à chaque route (limite connue, DECISIONS D-F05).
    const sources = await page
      .locator('script[src]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src') ?? ''));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) expect(src).toMatch(/^\/_next\//);
    await expect(page.locator('script[src^="/_next/"][integrity^="sha256-"]')).not.toHaveCount(0);
  });

  test('le lien d’évitement mène au contenu', async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Aller au contenu' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#contenu')).toBeFocused();
  });

  test('aucune violation d’accessibilité grave sur l’accueil et la 404 @a11y', async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/');
    expect(await seriousA11yViolations(page)).toEqual([]);
    await page.goto('/page-inexistante');
    expect(await seriousA11yViolations(page)).toEqual([]);
  });

  test('la 404 renvoie le bon statut et propose de reprendre le fil', async ({ page }) => {
    await dismissConsent(page);
    const response = await page.goto('/page-inexistante');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Revenir à l’accueil' })).toBeVisible();
    // Next peut répéter la balise (métadonnées diffusées en flux) : on vérifie qu'aucune n'indexe.
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
    await expect(page.locator('meta[name="robots"]:not([content*="noindex"])')).toHaveCount(0);
  });

  test('robots.txt et sitemap.xml sont générés', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain('Disallow: /espace-membre');
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain('/traiteur</loc>');
  });
});

test.describe('Responsive', () => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    test(`aucun défilement horizontal à ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      expect(await hasHorizontalScroll(page)).toBe(false);
    });
  }
});

test.describe('Consentement aux cookies', () => {
  test('refuser est aussi simple qu’accepter, et le choix est retenu', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('region', { name: 'Vos cookies, votre choix' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Refuser' }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(banner).toBeHidden();
    await page.getByRole('button', { name: 'Gérer mes cookies' }).click();
    await expect(banner).toBeVisible();
  });
});
