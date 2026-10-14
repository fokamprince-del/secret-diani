/**
 * Données de démonstration de l'API factice (tests e2e et Lighthouse), conformes à l'OpenAPI :
 * le typage échoue si le contrat du backend change. Aucun avis réel : contenus de test.
 */
import type { components } from '../../lib/api/schema';

type S = components['schemas'];

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5173';

export const settings: S['PublicSiteSettingsDto'] = {
  whatsappNumber: '33612345678',
  contactEmail: 'bonjour@exemple.fr',
  socialLinks: {
    instagram: 'https://www.instagram.com/diani_cuisto/',
    tiktok: '',
    facebook: '',
    youtube: '',
  },
  announcement: { enabled: true, text: 'Commandes de fin d’année ouvertes', link: '/contact' },
  features: { shopOpen: true, courseSalesOpen: true },
};

export const home: S['PublicHomeDto'] = {
  heroImage: null,
  universes: {
    catering: {
      text: 'Plateaux, bouchées et layer cakes faits maison pour vos fêtes.',
      image: null,
    },
    courses: { text: 'Des formations vidéo pas à pas pour progresser en pâtisserie.', image: null },
    shop: { text: 'Les kits d’accessoires choisis par Diani pour bien démarrer.', image: null },
  },
  dianiWord: {
    text: 'Bienvenue dans ma cuisine.\nIci, chaque recette se partage.',
    signature: 'Diani',
  },
};

export const reviews: S['ReviewListDto'] = {
  count: 4,
  average: 4.8,
  items: [
    {
      id: 'r1',
      authorName: 'Avis de test A.',
      rating: 5,
      content: 'Avis de démonstration numéro un.',
      occasion: 'Anniversaire, 30 personnes',
      receivedOn: '2026-09-12',
    },
    {
      id: 'r2',
      authorName: 'Avis de test B.',
      rating: 5,
      content: 'Avis de démonstration numéro deux.',
      occasion: null,
      receivedOn: '2026-08-02',
    },
    {
      id: 'r3',
      authorName: 'Avis de test C.',
      rating: 4,
      content: 'Avis de démonstration numéro trois.',
      occasion: 'Baptême',
      receivedOn: '2026-07-20',
    },
    {
      id: 'r4',
      authorName: 'Avis de test D.',
      rating: 5,
      content: 'Avis de démonstration numéro quatre.',
      occasion: null,
      receivedOn: '2026-06-14',
    },
  ],
};

const faqItems: S['FaqItemDto'][] = [
  {
    id: 'f1',
    category: 'traiteur',
    question: 'Comment réserver un plateau ?',
    answerHtml: '<p>Contactez-nous par WhatsApp ou par le formulaire de demande.</p>',
  },
  {
    id: 'f2',
    category: 'traiteur',
    question: 'Quel acompte faut-il verser ?',
    answerHtml: '<p>10 € sous 50 € de commande, 20 € au-delà.</p>',
  },
  {
    id: 'f3',
    category: 'formations',
    question: 'Combien de temps ai-je accès aux formations ?',
    answerHtml: '<p>Réponse de démonstration sur l’accès.</p>',
  },
  {
    id: 'f4',
    category: 'livraison',
    question: 'Livrez-vous partout en France ?',
    answerHtml: '<p>Réponse de démonstration sur la <strong>livraison</strong>.</p>',
  },
  {
    id: 'f5',
    category: 'paiement',
    question: 'Le paiement est-il sécurisé ?',
    answerHtml: '<p>Oui : Stripe ou PayPal, aucune carte ne transite par le site.</p>',
  },
];

export const faq: S['FaqListDto'] = {
  items: faqItems,
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answerHtml },
    })),
  },
};

const updatedAt = '2026-10-01T09:00:00.000Z';

function page(slug: string, title: string, intro: string): S['PageDto'] {
  return {
    slug,
    title,
    updatedAt,
    toc: [
      { id: 'premiere-partie', title: 'Première partie', level: 2 },
      { id: 'seconde-partie', title: 'Seconde partie', level: 2 },
    ],
    bodyHtml: `<p>${intro}</p><h2 id="premiere-partie">Première partie</h2><p>Texte de démonstration.</p><h2 id="seconde-partie">Seconde partie</h2><p>Texte de démonstration.</p>`,
    seo: {
      title,
      description: `${title} des Secrets de Diani.`,
      canonicalUrl: `${SITE_URL}/${slug}`,
    },
  };
}

export const pages: S['PageDto'][] = [
  page('a-propos', 'À propos', 'Page de démonstration sur l’histoire de la marque.'),
  page('mentions-legales', 'Mentions légales', 'Mentions légales de démonstration.'),
  page('cgv', 'Conditions générales de vente', 'Conditions de démonstration.'),
  page('confidentialite', 'Politique de confidentialité', 'Politique de démonstration.'),
];

export const categories: S['CategoryDto'][] = [
  {
    id: 'c1',
    slug: 'patisserie',
    name: 'Pâtisserie',
    description: null,
    position: 0,
    articleCount: 9,
  },
  {
    id: 'c2',
    slug: 'organisation',
    name: 'Organisation',
    description: 'Préparer un buffet.',
    position: 1,
    articleCount: 5,
  },
];

const categoryRef = (index: number): S['CategoryRefDto'] => {
  const category = categories[index % 3 === 2 ? 1 : 0]!;
  return { slug: category.slug, name: category.name };
};

/** 14 articles : plus d'une page (12 par page) pour tester « Afficher plus d’articles ». */
export const articleCards: S['ArticleCardDto'][] = Array.from({ length: 14 }, (_, index) => {
  const number = index + 1;
  const slug = number === 1 ? 'reussir-sa-creme-au-beurre' : `article-de-demonstration-${number}`;
  return {
    id: `a${String(number).padStart(2, '0')}`,
    slug,
    title: number === 1 ? 'Réussir sa crème au beurre' : `Article de démonstration ${number}`,
    excerpt: `Résumé de démonstration de l’article ${number}.`,
    readingMinutes: 3 + (index % 5),
    publishedAt: new Date(Date.UTC(2026, 9, 10 - index)).toISOString(),
    cover: null,
    category: categoryRef(index),
  };
});

export function articleDetail(card: S['ArticleCardDto']): S['ArticleDetailDto'] {
  const url = `${SITE_URL}/conseils/${card.slug}`;
  return {
    ...card,
    updatedAt,
    bodyHtml:
      '<p>Introduction de démonstration.</p><h2 id="les-ingredients">Les ingrédients</h2><ul><li>Beurre doux</li><li>Sucre glace</li></ul><h2 id="la-methode">La méthode</h2><h3 id="le-fouettage">Le fouettage</h3><p>Texte de démonstration.</p><blockquote><p>Une astuce de démonstration.</p></blockquote>',
    toc: [
      { id: 'les-ingredients', title: 'Les ingrédients', level: 2 },
      { id: 'la-methode', title: 'La méthode', level: 2 },
      { id: 'le-fouettage', title: 'Le fouettage', level: 3 },
    ],
    seo: { title: card.title, description: card.excerpt, canonicalUrl: url },
    relatedCourseSlug: card.slug === 'reussir-sa-creme-au-beurre' ? 'creme-au-beurre' : null,
    relatedArticles: articleCards.filter((other) => other.id !== card.id).slice(0, 3),
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: card.title,
      datePublished: card.publishedAt,
      mainEntityOfPage: url,
    },
  };
}

export const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Les Secrets de Diani',
  url: SITE_URL,
  sameAs: ['https://www.instagram.com/diani_cuisto/'],
};

export const sitemap: S['SitemapEntryDto'][] = [
  ...pages.map((entry) => ({
    loc: `${SITE_URL}/${entry.slug}`,
    lastModified: updatedAt,
    changeFrequency: 'yearly' as const,
    priority: 0.3,
  })),
  ...articleCards.map((card) => ({
    loc: `${SITE_URL}/conseils/${card.slug}`,
    lastModified: card.publishedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  })),
];

/** Ancienne adresse d'un article : l'API répond 301 vers la nouvelle. */
export const movedArticles: Record<string, string> = {
  'ancienne-creme-au-beurre': 'reussir-sa-creme-au-beurre',
};

export const NEWSLETTER_VALID_TOKEN = 'jeton-valide';
