import type { Page } from '@playwright/test';
import {
  dismissConsent,
  expect,
  hasHorizontalScroll,
  seriousA11yViolations,
  test,
} from './fixtures';

/**
 * Phase 2 : accueil et pages éditoriales, branchés sur l'API factice (tests/mock-api).
 * Les données affichées viennent des fixtures : aucun contenu métier n'est écrit en dur.
 */
const PAGES = [
  '/',
  '/traiteur',
  '/a-propos',
  '/contact',
  '/faq',
  '/conseils',
  '/conseils/categorie/patisserie',
  '/conseils/reussir-sa-creme-au-beurre',
  '/mentions-legales',
  '/cgv',
  '/confidentialite',
];

async function jsonLdTypes(page: Page) {
  return page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? '{}')['@type']));
}

test.describe('Accueil', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/');
  });

  test('présente les trois univers sans prix, chacun avec un seul bouton', async ({ page }) => {
    const universes = page.locator('#univers');
    await expect(universes.getByRole('heading', { level: 3 })).toHaveText([
      'Traiteur & commandes',
      'Formations en ligne',
      'Boutique & kits',
    ]);
    await expect(universes.getByText('Plateaux, bouchées et layer cakes')).toBeVisible();
    await expect(universes).not.toContainText('€');
    await expect(universes.getByRole('link')).toHaveCount(3);
    await expect(universes.getByRole('link', { name: 'Découvrir le traiteur' })).toHaveAttribute(
      'href',
      '/traiteur',
    );
    // Le bouton du hero mène aux univers.
    await page.getByRole('link', { name: 'Découvrir nos univers' }).click();
    await expect(page).toHaveURL(/#univers$/);
  });

  test('affiche les avis traiteur de l’API, le mot de Diani et la réassurance', async ({
    page,
  }) => {
    const reviews = page.getByRole('region', { name: 'Ce qu’en disent nos clients' });
    await expect(reviews.getByRole('listitem')).toHaveCount(4);
    await expect(reviews).toContainText('4,8 sur 5, d’après 4 avis sur le traiteur');
    await expect(reviews.getByText('Note : 5 sur 5').first()).toBeAttached();
    const word = page.getByRole('region', { name: 'Le mot de Diani' });
    await expect(word).toContainText('Bienvenue dans ma cuisine.');
    await expect(word.locator('figcaption')).toHaveText('Diani');
    await expect(page.getByRole('heading', { name: 'Paiement sécurisé' })).toBeVisible();
    expect(await jsonLdTypes(page)).toContain('Organization');
  });

  test('affiche le bandeau d’annonce réglé dans l’administration', async ({ page }) => {
    const announcement = page.getByRole('complementary', { name: 'Annonce' });
    await expect(announcement.getByRole('link')).toHaveText(/Commandes de fin d’année ouvertes/);
    await expect(announcement.getByRole('link')).toHaveAttribute('href', '/contact');
  });
});

test.describe('Pages éditoriales', () => {
  test('les pages de l’API s’affichent avec un h1, un sommaire et la date de mise à jour', async ({
    page,
  }) => {
    await dismissConsent(page);
    await page.goto('/mentions-legales');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mentions légales');
    await expect(page.getByText(/Mis à jour le 1 octobre 2026/)).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Sommaire' })
      .getByRole('link', { name: 'Seconde partie' })
      .click();
    await expect(page).toHaveURL(/#seconde-partie$/);

    await page.goto('/a-propos');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('À propos');
    await expect(page.getByRole('link', { name: 'Écrire à Diani' })).toHaveAttribute(
      'href',
      '/contact',
    );
  });

  test('une page inconnue de l’API répond 404', async ({ page }) => {
    const response = await page.goto('/page-retiree');
    expect(response?.status()).toBe(404);
  });

  test('la FAQ est groupée par rubrique, en accordéon natif, avec ses données structurées', async ({
    page,
  }) => {
    await dismissConsent(page);
    await page.goto('/faq');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Traiteur et commandes' }),
    ).toBeVisible();
    const question = page.getByText('Quel acompte faut-il verser ?');
    const answer = page.getByText('10 € sous 50 € de commande, 20 € au-delà.');
    await expect(answer).toBeHidden();
    await question.click();
    await expect(answer).toBeVisible();
    await question.focus();
    await page.keyboard.press('Enter');
    await expect(answer).toBeHidden();
    expect(await jsonLdTypes(page)).toContain('FAQPage');
  });
});

test.describe('Conseils & astuces', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('liste paginée : « Afficher plus d’articles » ajoute la suite et y place le focus', async ({
    page,
  }) => {
    await page.goto('/conseils');
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(12);
    await page.getByRole('button', { name: 'Afficher plus d’articles' }).click();
    await expect(cards).toHaveCount(14);
    await expect(page.getByRole('link', { name: 'Article de démonstration 13' })).toBeFocused();
    await expect(
      page.getByRole('status').filter({ hasText: '2 articles ajoutés.' }),
    ).toBeAttached();
    await expect(page.getByRole('button', { name: 'Afficher plus d’articles' })).toHaveCount(0);
  });

  test('le filtre par catégorie est une vraie page, signalée comme courante', async ({ page }) => {
    await page.goto('/conseils');
    const filter = page.getByRole('navigation', { name: 'Catégories de conseils' });
    await filter.getByRole('link', { name: 'Organisation' }).click();
    await expect(page).toHaveURL(/\/conseils\/categorie\/organisation$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Organisation');
    await expect(filter.getByRole('link', { name: 'Organisation' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('article')).toHaveCount(4);
    for (const label of await page
      .getByRole('article')
      .getByText(/^Organisation$/)
      .all()) {
      await expect(label).toBeVisible();
    }
  });

  test('article : h1, sommaire, temps de lecture, formation liée, articles liés, JSON-LD', async ({
    page,
  }) => {
    await page.goto('/conseils');
    await page.getByRole('link', { name: 'Réussir sa crème au beurre' }).click();
    await expect(page).toHaveURL(/\/conseils\/reussir-sa-creme-au-beurre$/);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Réussir sa crème au beurre');
    await expect(page.getByText('3 minutes de lecture')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sommaire' }).getByRole('link')).toHaveCount(
      3,
    );
    await expect(page.getByRole('heading', { level: 2, name: 'La méthode' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Découvrir les formations' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'À lire aussi' }).getByRole('heading', { level: 3 }),
    ).toHaveCount(3);
    expect(await jsonLdTypes(page)).toContain('Article');
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  });

  test('une ancienne adresse d’article redirige définitivement vers la nouvelle', async ({
    page,
  }) => {
    const response = await page.goto('/conseils/ancienne-creme-au-beurre');
    expect(response?.url()).toMatch(/\/conseils\/reussir-sa-creme-au-beurre$/);
    expect(response?.request().redirectedFrom()).not.toBeNull();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Réussir sa crème au beurre');
  });

  test('un article inexistant répond 404', async ({ page }) => {
    const response = await page.goto('/conseils/article-inconnu');
    expect(response?.status()).toBe(404);
  });
});

test.describe('Formulaire de contact', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
    await page.goto('/contact');
  });

  test('signale les erreurs sous chaque champ et place le focus sur le premier', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Envoyer mon message' }).click();
    const name = page.getByRole('main').getByRole('textbox', { name: 'Votre nom' });
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Indiquez votre nom.')).toBeVisible();
    await expect(page.getByText('Indiquez votre adresse e-mail.')).toBeVisible();
    await expect(page.getByText(/Votre message est un peu court/)).toBeVisible();
  });

  test('envoie le message et affiche la confirmation de l’API', async ({ page }) => {
    await page.getByRole('main').getByRole('textbox', { name: 'Votre nom' }).fill('Awa Diallo');
    await page
      .getByRole('main')
      .getByRole('textbox', { name: 'Votre e-mail' })
      .fill('awa@exemple.fr');
    await page.getByRole('combobox', { name: 'Le sujet' }).selectOption('catering');
    await page
      .getByRole('textbox', { name: 'Votre message' })
      .fill('Bonjour, un plateau pour samedi ?');
    await page.getByRole('button', { name: 'Envoyer mon message' }).click();
    await expect(
      page
        .getByRole('main')
        .getByRole('status')
        .filter({ hasText: 'votre message a bien été envoyé' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer mon message' })).toHaveCount(0);
  });

  test('reporte une erreur de champ renvoyée par l’API', async ({ page }) => {
    await page.getByRole('main').getByRole('textbox', { name: 'Votre nom' }).fill('Awa Diallo');
    await page
      .getByRole('main')
      .getByRole('textbox', { name: 'Votre e-mail' })
      .fill('refuse@exemple.fr');
    await page
      .getByRole('main')
      .getByRole('textbox', { name: 'Votre message' })
      .fill('Un message assez long.');
    await page.getByRole('button', { name: 'Envoyer mon message' }).click();
    await expect(page.getByText('doit être une adresse e-mail valide')).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('textbox', { name: 'Votre e-mail' }),
    ).toBeFocused();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Corrigez les champs signalés',
    );
  });

  test('explique une limite de débit sans jargon', async ({ page }) => {
    await page.getByRole('main').getByRole('textbox', { name: 'Votre nom' }).fill('Awa Diallo');
    await page
      .getByRole('main')
      .getByRole('textbox', { name: 'Votre e-mail' })
      .fill('limite@exemple.fr');
    await page
      .getByRole('main')
      .getByRole('textbox', { name: 'Votre message' })
      .fill('Un message assez long.');
    await page.getByRole('button', { name: 'Envoyer mon message' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Trop de messages envoyés',
    );
  });

  test('propose WhatsApp et l’e-mail configurés dans l’administration', async ({ page }) => {
    const whatsapp = page.getByRole('link', { name: /Écrire sur WhatsApp/ });
    await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/33612345678\?text=/);
    await expect(
      page.getByRole('main').getByRole('link', { name: 'bonjour@exemple.fr' }),
    ).toHaveAttribute('href', 'mailto:bonjour@exemple.fr');
  });
});

test.describe('Newsletter (double opt-in)', () => {
  test.beforeEach(async ({ page }) => {
    await dismissConsent(page);
  });

  test('le consentement explicite est obligatoire, puis l’inscription est confirmée', async ({
    page,
  }) => {
    await page.goto('/faq');
    const form = page.getByRole('form', { name: 'La lettre de Diani' });
    await form.getByRole('textbox', { name: 'Votre e-mail' }).fill('awa@exemple.fr');
    await form.getByRole('button', { name: 'M’inscrire à la lettre' }).click();
    await expect(form.getByText('Cochez la case pour confirmer votre inscription.')).toBeVisible();
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'M’inscrire à la lettre' }).click();
    await expect(form.getByRole('status')).toContainText(
      'un e-mail de confirmation vient de vous être envoyé',
    );
    await expect(form.getByRole('textbox', { name: 'Votre e-mail' })).toHaveValue('');
  });

  test('la confirmation n’agit qu’au clic et retire le jeton de l’adresse', async ({ page }) => {
    await page.goto('/newsletter/confirmer?token=jeton-valide');
    await expect(page).toHaveURL(/\/newsletter\/confirmer$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.getByRole('button', { name: 'Confirmer mon inscription' }).click();
    await expect(
      page.getByRole('main').getByRole('status').filter({ hasText: 'inscription est confirmée' }),
    ).toBeVisible();
  });

  test('un lien expiré ou incomplet est expliqué', async ({ page }) => {
    await page.goto('/newsletter/desinscription?token=perime');
    await page.getByRole('button', { name: 'Me désinscrire' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Ce lien n’est plus valide',
    );

    await page.goto('/newsletter/confirmer');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Ce lien est incomplet');
  });
});

test.describe('SEO, accessibilité et responsive des pages éditoriales', () => {
  test('titres uniques, un seul h1 et une URL canonique par page', async ({ page }) => {
    const titles = new Set<string>();
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('h1'), path).toHaveCount(1);
      const title = await page.title();
      expect(titles.has(title), `titre en double : ${title}`).toBe(false);
      titles.add(title);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(new URL(canonical ?? '').pathname.replace(/\/$/, ''), path).toBe(
        path.replace(/\/$/, ''),
      );
    }
  });

  test('aucune violation d’accessibilité grave @a11y', async ({ page }) => {
    test.setTimeout(90_000);
    await dismissConsent(page);
    for (const path of [...PAGES, '/newsletter/confirmer?token=jeton-valide']) {
      await page.goto(path);
      expect(await seriousA11yViolations(page), path).toEqual([]);
    }
  });

  test('aucun défilement horizontal à 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of PAGES) {
      await page.goto(path);
      expect(await hasHorizontalScroll(page), path).toBe(false);
    }
  });

  test('le plan du site liste les pages et les articles de l’API', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('/a-propos</loc>');
    expect(sitemap).toContain('/conseils/reussir-sa-creme-au-beurre</loc>');
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /newsletter/');
  });
});
