/**
 * API factice pour les tests e2e et Lighthouse du frontend : sert les fixtures sur le port 3999
 * (jamais 3000, celui du vrai backend en local). Lancée par Playwright et par `npm run build:e2e`.
 * Usage : node tests/mock-api/server.mts
 *
 * Comportements simulés pour les formulaires :
 * - contact : e-mail contenant « refuse » → 400 avec erreur sur le champ ; « limite » → 429 ;
 * - newsletter : jeton « jeton-valide » accepté, tout autre jeton refusé (400) ;
 * - demande traiteur : date d'événement à moins de 2 jours → 400 sur le champ `eventDate`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handleAuth, refreshStats, userIdForEmail } from './auth.mts';
import { completeCourse, handleCourses } from './courses.mts';
import { handleShop, paymentPage } from './shop.mts';
import {
  articleCards,
  articleDetail,
  CATERING_WHATSAPP,
  cateringCatalog,
  cateringConditions,
  categories,
  faq,
  home,
  movedArticles,
  NEWSLETTER_VALID_TOKEN,
  organization,
  pages,
  reviews,
  settings,
  SITE_URL,
  sitemap,
} from './fixtures.mts';

const PORT = Number(process.env.MOCK_API_PORT ?? 3999);
const PREFIX = '/api/v1';
const ALLOWED_ORIGIN = new URL(SITE_URL).origin;

function send(
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers: Record<string, string | string[]> = {},
) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function error(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  errors?: unknown,
) {
  send(res, status, { statusCode: status, code, message, errors, requestId: 'mock' });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

const notFound = (res: ServerResponse) =>
  error(res, 404, 'NOT_FOUND', 'Ce contenu est introuvable.');

function listArticles(url: URL) {
  const category = url.searchParams.get('category');
  const cursor = url.searchParams.get('cursor');
  const limit = Number(url.searchParams.get('limit') ?? 12);
  const filtered = articleCards.filter((card) => !category || card.category?.slug === category);
  const start = cursor ? filtered.findIndex((card) => card.id === cursor) + 1 : 0;
  const items = filtered.slice(start, start + limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: last && start + limit < filtered.length ? last.id : null,
  };
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const origin = req.headers.origin;
  if (origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
      'Access-Control-Max-Age': '600',
    });
    res.end();
    return;
  }

  // Statistiques réservées aux tests (jamais exposées par le vrai backend).
  if (url.pathname === '/__mock/stats') return send(res, 200, refreshStats());
  if (url.pathname === '/__mock/paiement') return paymentPage(url, res, SITE_URL);
  if (url.pathname === '/__mock/terminer') {
    const done = completeCourse(
      url.searchParams.get('email') ?? '',
      url.searchParams.get('formation') ?? '',
      userIdForEmail,
    );
    return send(res, done ? 200 : 404, { done });
  }

  const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : null;
  if (path === null) return notFound(res);

  const body = req.method === 'GET' ? {} : await readJson(req);
  if (await handleAuth(req, res, path, body, send, error)) return;
  if (await handleShop(req, res, url, path, body, send, error, SITE_URL)) return;
  if (await handleCourses(req, res, path, body, send, error)) return;

  if (req.method === 'GET') {
    if (path === '/site/settings') return send(res, 200, settings);
    if (path === '/site/home') return send(res, 200, home);
    if (path === '/content/reviews') {
      const limit = Number(url.searchParams.get('limit') ?? 6);
      return send(res, 200, { ...reviews, items: reviews.items.slice(0, limit) });
    }
    if (path === '/content/faq') return send(res, 200, faq);
    if (path === '/content/pages') {
      return send(
        res,
        200,
        pages.map(({ slug, title }) => ({ slug, title })),
      );
    }
    if (path === '/content/article-categories') return send(res, 200, categories);
    if (path === '/content/articles') return send(res, 200, listArticles(url));
    if (path === '/seo/organization') return send(res, 200, organization);
    if (path === '/seo/sitemap') return send(res, 200, sitemap);
    if (path === '/catering/catalog') return send(res, 200, cateringCatalog);
    if (path === '/catering/conditions') return send(res, 200, cateringConditions);
    if (path === '/catering/slots') {
      return error(res, 403, 'FEATURE_DISABLED', 'La commande en ligne n’est pas ouverte.');
    }

    const pageMatch = /^\/content\/pages\/([a-z0-9-]+)$/.exec(path);
    if (pageMatch) {
      const found = pages.find((entry) => entry.slug === pageMatch[1]);
      return found ? send(res, 200, found) : notFound(res);
    }
    const articleMatch = /^\/content\/articles\/([a-z0-9-]+)$/.exec(path);
    if (articleMatch) {
      const slug = articleMatch[1]!;
      const moved = movedArticles[slug];
      if (moved) {
        return send(
          res,
          301,
          { redirectSlug: moved },
          { Location: `${PREFIX}/content/articles/${moved}` },
        );
      }
      const card = articleCards.find((entry) => entry.slug === slug);
      return card ? send(res, 200, articleDetail(card)) : notFound(res);
    }
    return notFound(res);
  }

  if (req.method === 'POST') {
    if (path === '/contact') {
      const email = String(body.email ?? '');
      if (email.includes('limite')) {
        return error(
          res,
          429,
          'TOO_MANY_REQUESTS',
          'Trop de messages envoyés. Réessayez dans quelques minutes.',
        );
      }
      if (email.includes('refuse')) {
        return error(res, 400, 'VALIDATION_ERROR', 'Les données envoyées sont invalides.', [
          { field: 'email', messages: ['doit être une adresse e-mail valide'] },
        ]);
      }
      return send(res, 201, {
        message: 'Merci, votre message a bien été envoyé. Diani vous répond sous 48 heures.',
      });
    }
    if (path === '/catering-requests') {
      const minDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      if (String(body.eventDate ?? '') < minDate) {
        return error(res, 400, 'VALIDATION_ERROR', 'Les données envoyées sont invalides.', [
          { field: 'eventDate', messages: [`doit être au plus tôt le ${minDate}`] },
        ]);
      }
      const variants = cateringCatalog.categories.flatMap((category) =>
        category.products.flatMap((item) => item.variants),
      );
      const items = Array.isArray(body.items)
        ? (body.items as { variantId: string; quantity: number }[])
        : [];
      const total = items.reduce(
        (sum, item) =>
          sum +
          (variants.find((variant) => variant.id === item.variantId)?.priceCents ?? 0) *
            item.quantity,
        0,
      );
      const reference = 'TR-000042';
      return send(res, 201, {
        reference,
        message: 'Merci ! Votre demande est bien reçue : Diani vous recontacte rapidement.',
        estimatedTotalCents: items.length > 0 ? total : null,
        whatsappUrl: `https://wa.me/${CATERING_WHATSAPP}?text=${encodeURIComponent(`Bonjour Diani, je viens d’envoyer la demande ${reference}.`)}`,
      });
    }
    if (path === '/newsletter/subscribe') {
      return send(res, 202, {
        message:
          'Merci ! Si cette adresse n’est pas déjà inscrite, un e-mail de confirmation vient de vous être envoyé.',
      });
    }
    if (path === '/newsletter/confirm' || path === '/newsletter/unsubscribe') {
      if (body.token !== NEWSLETTER_VALID_TOKEN) {
        return error(
          res,
          400,
          'INVALID_TOKEN',
          'Ce lien n’est plus valide. Il a peut-être expiré ou déjà servi.',
        );
      }
      return send(res, 200, {
        message:
          path === '/newsletter/confirm'
            ? 'Votre inscription est confirmée. À très vite dans votre boîte mail !'
            : 'Votre désinscription est enregistrée : vous ne recevrez plus nos e-mails.',
      });
    }
  }
  return notFound(res);
}

createServer((req, res) => {
  handle(req, res).catch(() => error(res, 500, 'INTERNAL_ERROR', 'Erreur de l’API factice.'));
}).listen(PORT, () => {
  console.warn(`API factice prête sur http://localhost:${PORT}`);
});
