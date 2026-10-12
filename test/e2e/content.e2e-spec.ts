import type { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppConfigService } from '../../src/config/app-config.service';
import { REVALIDATE_QUEUE } from '../../src/content/cache/revalidate.constants';
import { MediaProcessingService } from '../../src/media/media-processing.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { redisOptionsFromUrl } from '../../src/redis/redis-options';
import { StorageService } from '../../src/storage/storage.service';
import { type AdminSession, createAdminSession } from './utils/admin-helpers';
import { client, MailInbox, registerVerifiedUser } from './utils/auth-helpers';
import { createTestApp } from './utils/test-app';

const BODY = [
  '# Bien choisir son beurre',
  'Le beurre doit être **mou**, pas fondu.',
  '## Les étapes',
  'Battre 5 minutes. <script>alert("xss")</script>',
  '### Astuce',
  '[Nos kits](https://lessecretsdediani.fr/boutique) · [Recette externe](https://exemple.org)',
].join('\n\n');

describe('Contenus éditoriaux et SEO (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: AdminSession;
  let coverId: string;
  let categoryId: string;
  const inbox = new MailInbox();
  const unique = Date.now().toString(36);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const storage = app.get(StorageService);
    await storage.ensureBuckets();
    admin = await createAdminSession(app);

    const photo = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#F0E2D9' },
    })
      .jpeg()
      .toBuffer();
    const media = await admin.http
      .post('/admin/media', admin.accessToken)
      .attach('file', photo, { filename: 'couverture.jpg', contentType: 'image/jpeg' })
      .expect(201);
    coverId = media.body.id as string;
    await new MediaProcessingService(prisma, storage, app.get(AppConfigService)).process(coverId);

    const category = await admin.http
      .post('/admin/article-categories', admin.accessToken)
      .send({ name: `Pâtisserie fine ${unique}` })
      .expect(201);
    categoryId = category.body.id as string;
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  const pub = () => client(app);

  describe('articles', () => {
    let articleId: string;
    let slug: string;

    it('crée un brouillon (slug généré, Markdown rendu et assaini), invisible du public', async () => {
      const res = await admin.http
        .post('/admin/articles', admin.accessToken)
        .send({
          title: `Réussir sa crème au beurre ${unique}`,
          excerpt: 'Les gestes simples pour une crème lisse et stable.',
          bodyMarkdown: BODY,
          categoryId,
          coverMediaId: coverId,
          coverAlt: 'Crème au beurre lissée sur un layer cake',
        })
        .expect(201);
      articleId = res.body.id as string;
      slug = res.body.slug as string;
      expect(slug).toBe(`reussir-sa-creme-au-beurre-${unique}`);
      expect(res.body).toMatchObject({ state: 'draft', readingMinutes: 1 });
      await pub().get(`/content/articles/${slug}`).expect(404);
    });

    it('publie : détail complet (HTML sûr, sommaire, image, SEO, JSON-LD)', async () => {
      await admin.http
        .post(`/admin/articles/${articleId}/publish`, admin.accessToken)
        .send({})
        .expect(200);
      const res = await pub().get(`/content/articles/${slug}`).expect(200);
      expect(res.body.bodyHtml).not.toContain('<script');
      expect(res.body.bodyHtml).not.toContain('<h1');
      expect(res.body.bodyHtml).toContain('<h2 id="bien-choisir-son-beurre">');
      expect(res.body.bodyHtml).toContain('rel="noopener noreferrer nofollow"');
      expect(res.body.toc).toEqual([
        { id: 'bien-choisir-son-beurre', title: 'Bien choisir son beurre', level: 2 },
        { id: 'les-etapes', title: 'Les étapes', level: 2 },
        { id: 'astuce', title: 'Astuce', level: 3 },
      ]);
      expect(res.body.cover).toMatchObject({
        alt: 'Crème au beurre lissée sur un layer cake',
        width: 800,
        height: 600,
      });
      expect(res.body.cover.sources.avif.length).toBeGreaterThan(0);
      expect(res.body.category.name).toBe(`Pâtisserie fine ${unique}`);
      expect(res.body.seo).toEqual({
        title: `Réussir sa crème au beurre ${unique}`,
        description: 'Les gestes simples pour une crème lisse et stable.',
        canonicalUrl: `http://localhost:5173/conseils/${slug}`,
      });
      expect(res.body.jsonLd).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `Réussir sa crème au beurre ${unique}`,
        author: { '@type': 'Person', name: 'Diani' },
      });
    });

    it('en-têtes de cache CDN et réponse 304 sur ETag', async () => {
      const first = await pub().get(`/content/articles/${slug}`).expect(200);
      expect(first.headers['cache-control']).toBe(
        'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
      );
      const etag = first.headers.etag as string;
      expect(etag).toBeDefined();
      await pub().get(`/content/articles/${slug}`).set('If-None-Match', etag).expect(304);
    });

    it('une modification admin est visible immédiatement (cache invalidé) et revalide le frontend', async () => {
      await pub().get(`/content/articles/${slug}`).expect(200);
      await admin.http
        .patch(`/admin/articles/${articleId}`, admin.accessToken)
        .send({ excerpt: 'Nouvelle accroche, plus gourmande.' })
        .expect(200);
      const res = await pub().get(`/content/articles/${slug}`).expect(200);
      expect(res.body.excerpt).toBe('Nouvelle accroche, plus gourmande.');

      const queue = new Queue(REVALIDATE_QUEUE, {
        prefix: 'diani:bull',
        connection: redisOptionsFromUrl(process.env.REDIS_URL ?? ''),
      });
      const jobs = await queue.getJobs(['delayed', 'waiting']);
      expect(
        jobs.some((job) => (job.data as { tags: string[] }).tags.includes(`article:${slug}`)),
      ).toBe(true);
      await queue.close();
    });

    it('liste publique filtrée par catégorie, avec pagination par curseur', async () => {
      const category = await prisma.articleCategory.findUniqueOrThrow({
        where: { id: categoryId },
      });
      const res = await pub()
        .get(`/content/articles?category=${category.slug}&limit=1`)
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ slug, readingMinutes: 1 });
      expect(res.body.items[0].bodyHtml).toBeUndefined();
      const categories = await pub().get('/content/article-categories').expect(200);
      expect(categories.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: categoryId, articleCount: 1 })]),
      );
    });

    it('changer le slug d’un article publié : l’ancienne adresse redirige (301)', async () => {
      const newSlug = `creme-au-beurre-inratable-${unique}`;
      await admin.http
        .patch(`/admin/articles/${articleId}`, admin.accessToken)
        .send({ slug: newSlug })
        .expect(200);
      const old = await pub().get(`/content/articles/${slug}`).expect(301);
      expect(old.headers.location).toBe(`/api/v1/content/articles/${newSlug}`);
      expect(old.headers['x-canonical-slug']).toBe(newSlug);
      await pub().get(`/content/articles/${newSlug}`).expect(200);

      // L'ancienne adresse reste réservée.
      const conflict = await admin.http
        .post('/admin/articles', admin.accessToken)
        .send({ title: 'Autre', slug, excerpt: 'Un autre article.', bodyMarkdown: 'Texte' })
        .expect(409);
      expect(conflict.body.errors).toEqual([{ field: 'slug', messages: ['déjà utilisée'] }]);
      slug = newSlug;
    });

    it('programmation : date future = invisible jusqu’à cette date', async () => {
      const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      const created = await admin.http
        .post('/admin/articles', admin.accessToken)
        .send({
          title: `Article programmé ${unique}`,
          excerpt: 'Bientôt en ligne.',
          bodyMarkdown: 'Patience.',
        })
        .expect(201);
      const scheduled = await admin.http
        .post(`/admin/articles/${created.body.id as string}/publish`, admin.accessToken)
        .send({ publishAt: future })
        .expect(200);
      expect(scheduled.body.state).toBe('scheduled');
      await pub()
        .get(`/content/articles/${created.body.slug as string}`)
        .expect(404);
      const list = await admin.http
        .get('/admin/articles?state=scheduled', admin.accessToken)
        .expect(200);
      expect((list.body.items as { id: string }[]).map((a) => a.id)).toContain(created.body.id);
    });

    it('refuse une couverture qui n’est pas une image prête, et un slug invalide', async () => {
      const res = await admin.http
        .post('/admin/articles', admin.accessToken)
        .send({
          title: 'Test',
          excerpt: 'Un résumé valable.',
          bodyMarkdown: 'Texte',
          coverMediaId: '01928f6e-7c1a-7b3e-9a6f-2f1c3d4e5f60',
          slug: 'Pas Un Slug',
        })
        .expect(400);
      expect((res.body.errors as { field: string }[]).map((e) => e.field)).toEqual(['slug']);
      const cover = await admin.http
        .post('/admin/articles', admin.accessToken)
        .send({
          title: 'Test',
          excerpt: 'Un résumé valable.',
          bodyMarkdown: 'Texte',
          coverMediaId: '01928f6e-7c1a-7b3e-9a6f-2f1c3d4e5f60',
        })
        .expect(400);
      expect(cover.body.errors).toEqual([
        { field: 'coverMediaId', messages: ['image introuvable ou pas encore prête'] },
      ]);
    });

    it('un média utilisé en couverture ne peut pas être supprimé', async () => {
      const res = await admin.http.delete(`/admin/media/${coverId}`, admin.accessToken).expect(409);
      expect(res.body.message).toMatch(/utilisé par un article/);
    });

    it('dépublier puis supprimer : l’article disparaît et son adresse est libérée', async () => {
      await admin.http
        .post(`/admin/articles/${articleId}/unpublish`, admin.accessToken)
        .expect(200);
      await pub().get(`/content/articles/${slug}`).expect(404);
      await admin.http.delete(`/admin/articles/${articleId}`, admin.accessToken).expect(204);
      await admin.http.get(`/admin/articles/${articleId}`, admin.accessToken).expect(404);
      await admin.http
        .post('/admin/articles', admin.accessToken)
        .send({
          title: 'Réutilisation',
          slug,
          excerpt: 'Adresse réutilisée.',
          bodyMarkdown: 'Texte',
        })
        .expect(201);
    });

    it('slug mal formé dans l’URL publique → 404', async () => {
      await pub().get('/content/articles/..%2F..%2Fetc').expect(404);
      await pub()
        .get(`/content/articles/${'a'.repeat(200)}`)
        .expect(404);
    });
  });

  describe('pages statiques', () => {
    it('création non publiée, puis publication sans développeur', async () => {
      const pageSlug = `cgv-${unique}`;
      await admin.http
        .put(`/admin/pages/${pageSlug}`, admin.accessToken)
        .send({
          title: 'Conditions générales de vente',
          bodyMarkdown: '## Article 1\n\nObjet.',
          published: false,
        })
        .expect(200);
      await pub().get(`/content/pages/${pageSlug}`).expect(404);
      await admin.http
        .put(`/admin/pages/${pageSlug}`, admin.accessToken)
        .send({
          title: 'Conditions générales de vente',
          bodyMarkdown: '## Article 1\n\nObjet.',
          published: true,
        })
        .expect(200);
      const page = await pub().get(`/content/pages/${pageSlug}`).expect(200);
      expect(page.body).toMatchObject({
        title: 'Conditions générales de vente',
        toc: [{ id: 'article-1', title: 'Article 1', level: 2 }],
        seo: { description: 'Article 1 Objet.', canonicalUrl: `http://localhost:5173/${pageSlug}` },
      });
      const links = await pub().get('/content/pages').expect(200);
      expect(links.body).toEqual(
        expect.arrayContaining([{ slug: pageSlug, title: 'Conditions générales de vente' }]),
      );
    });
  });

  describe('FAQ', () => {
    it('ordre par glisser-déposer, questions non publiées masquées, JSON-LD FAQPage', async () => {
      const make = (question: string, published = true) =>
        admin.http
          .post('/admin/faq', admin.accessToken)
          .send({
            category: 'livraison',
            question,
            answerMarkdown: 'Réponse **claire**.',
            published,
          })
          .expect(201);
      const a = await make(`Livrez-vous le dimanche ? ${unique}`);
      const b = await make(`Quels sont les délais ? ${unique}`);
      await make(`Question cachée ${unique}`, false);
      await admin.http
        .put('/admin/faq/order', admin.accessToken)
        .send({ ids: [b.body.id, a.body.id] })
        .expect(200);

      const res = await pub().get('/content/faq?category=livraison').expect(200);
      const questions = (res.body.items as { question: string }[]).map((item) => item.question);
      expect(questions.indexOf(`Quels sont les délais ? ${unique}`)).toBeLessThan(
        questions.indexOf(`Livrez-vous le dimanche ? ${unique}`),
      );
      expect(questions).not.toContain(`Question cachée ${unique}`);
      expect(res.body.items[0].answerHtml).toContain('<strong>claire</strong>');
      expect(res.body.jsonLd['@type']).toBe('FAQPage');

      await admin.http
        .put('/admin/faq/order', admin.accessToken)
        .send({ ids: [a.body.id, '01928f6e-7c1a-7b3e-9a6f-2f1c3d4e5f60'] })
        .expect(400);
    });
  });

  describe('avis clients (aucun avis inventé)', () => {
    const review = {
      authorName: 'Awa D.',
      rating: 5,
      content: 'Plateau découverte parfait pour notre anniversaire, tout le monde a adoré.',
      occasion: 'Anniversaire, 30 personnes',
      receivedOn: '2026-09-12',
      sourceNote: 'Message WhatsApp du 12/09',
      consentConfirmed: true,
    };

    it('exige la provenance, le consentement et une note de 1 à 5', async () => {
      const res = await admin.http
        .post('/admin/reviews', admin.accessToken)
        .send({ ...review, consentConfirmed: false, rating: 6, sourceNote: undefined })
        .expect(400);
      expect((res.body.errors as { field: string }[]).map((e) => e.field).sort()).toEqual([
        'consentConfirmed',
        'rating',
        'sourceNote',
      ]);
    });

    it('n’est public qu’après approbation ; une modification du texte le renvoie en modération', async () => {
      const created = await admin.http
        .post('/admin/reviews', admin.accessToken)
        .send(review)
        .expect(201);
      const id = created.body.id as string;
      expect(created.body.status).toBe('pending');
      const before = await pub().get('/content/reviews').expect(200);
      expect((before.body.items as { id: string }[]).map((r) => r.id)).not.toContain(id);

      await admin.http
        .post(`/admin/reviews/${id}/moderate`, admin.accessToken)
        .send({ decision: 'approved' })
        .expect(200);
      const after = await pub().get('/content/reviews').expect(200);
      const shown = (after.body.items as Record<string, unknown>[]).find((r) => r.id === id);
      expect(shown).toEqual({
        id,
        authorName: 'Awa D.',
        rating: 5,
        content: review.content,
        occasion: 'Anniversaire, 30 personnes',
        receivedOn: '2026-09-12',
      });
      expect(JSON.stringify(after.body)).not.toContain('WhatsApp');
      expect(after.body.average).toBe(5);

      const edited = await admin.http
        .patch(`/admin/reviews/${id}`, admin.accessToken)
        .send({ content: 'Texte retouché par erreur.' })
        .expect(200);
      expect(edited.body.status).toBe('pending');
      const hidden = await pub().get('/content/reviews').expect(200);
      expect((hidden.body.items as { id: string }[]).map((r) => r.id)).not.toContain(id);
    });
  });

  describe('SEO', () => {
    it('sitemap (JSON et XML), robots.txt du site et de l’API, Organization', async () => {
      const created = await admin.http
        .post('/admin/articles', admin.accessToken)
        .send({ title: `Sitemap ${unique}`, excerpt: 'Article du sitemap.', bodyMarkdown: 'Texte' })
        .expect(201);
      await admin.http
        .post(`/admin/articles/${created.body.id as string}/publish`, admin.accessToken)
        .send({})
        .expect(200);
      const article = { slug: created.body.slug as string };
      const json = await pub().get('/seo/sitemap').expect(200);
      const locs = (json.body as { loc: string }[]).map((entry) => entry.loc);
      expect(locs).toContain('http://localhost:5173/');
      expect(locs).toContain(`http://localhost:5173/conseils/${article.slug}`);

      const xml = await pub().get('/seo/sitemap.xml').expect(200);
      expect(xml.headers['content-type']).toContain('application/xml');
      expect(xml.text).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset/);

      const robots = await pub().get('/seo/robots.txt').expect(200);
      expect(robots.text).toContain('Disallow: /espace-membre');
      expect(robots.text).toContain('Sitemap: http://localhost:5173/sitemap.xml');

      const apiRobots = await request(app.getHttpServer()).get('/robots.txt').expect(200);
      expect(apiRobots.text).toBe('User-agent: *\nDisallow: /\n');

      const org = await pub().get('/seo/organization').expect(200);
      expect(org.body).toMatchObject({ '@type': 'Organization', url: 'http://localhost:5173' });
    });
  });

  describe('contrôle d’accès', () => {
    it('toutes les routes d’administration des contenus sont réservées aux administrateurs', async () => {
      const cliente = await registerVerifiedUser(app, inbox);
      for (const path of [
        '/admin/articles',
        '/admin/pages',
        '/admin/faq',
        '/admin/reviews',
        '/admin/media',
        '/admin/article-categories',
      ]) {
        await cliente.http.get(path, cliente.accessToken).expect(403);
        await pub().get(path).expect(401);
      }
    });
  });
});
