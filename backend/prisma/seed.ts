import { type FaqCategory, PrismaClient } from '@prisma/client';
import { MarkdownService } from '../src/content/markdown/markdown.service';
import type { AppConfigService } from '../src/config/app-config.service';
import { seedCatering } from './seed-data/catering';
import { seedCourses } from './seed-data/courses';
import { seedShop } from './seed-data/shop';

/**
 * Seed des données de référence (idempotent : relançable sans doublon, sans écraser
 * les modifications faites depuis l'administration).
 * Aucun compte administrateur n'est créé ici : utiliser `make create-admin`.
 * Les textes éditoriaux sont créés NON PUBLIÉS : Diani les relit et les publie elle-même.
 */
const prisma = new PrismaClient();

const markdown = new MarkdownService({
  get: (key: string) =>
    key === 'PUBLIC_SITE_URL'
      ? (process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173')
      : (process.env.MEDIA_PUBLIC_BASE_URL ?? 'http://localhost:8333/diani-public'),
} as AppConfigService);

const SETTINGS: { key: string; value: string; description: string }[] = [
  {
    key: 'site.whatsapp_number',
    value: '',
    description: 'Numéro WhatsApp affiché sur le site (format international, ex. +33600000000).',
  },
  { key: 'site.name', value: 'Les Secrets de Diani', description: 'Nom de la marque.' },
  {
    key: 'site.author_name',
    value: 'Diani',
    description: 'Autrice affichée sur les articles (données structurées).',
  },
  {
    key: 'site.instagram_url',
    value: 'https://www.instagram.com/diani_cuisto/',
    description: 'Compte Instagram de la marque.',
  },
  { key: 'site.logo_url', value: '', description: 'URL du logo (données structurées).' },
];

const CATEGORIES = [
  { slug: 'patisserie', name: 'Pâtisserie', position: 0 },
  { slug: 'traiteur-et-buffets', name: 'Traiteur et buffets', position: 1 },
  { slug: 'organisation', name: 'Organisation', position: 2 },
  { slug: 'vendre-ses-creations', name: 'Vendre ses créations', position: 3 },
];

const PAGES = [
  { slug: 'a-propos', title: 'À propos' },
  { slug: 'mentions-legales', title: 'Mentions légales' },
  { slug: 'cgv', title: 'Conditions générales de vente' },
  { slug: 'confidentialite', title: 'Politique de confidentialité' },
];

/** Réponses tirées du cahier des charges, à relire avant publication. */
const FAQ: { category: FaqCategory; question: string; answer: string }[] = [
  {
    category: 'traiteur',
    question: 'Comment commander un plateau, des mini bouchées ou un layer cake ?',
    answer:
      'Contactez-nous avec le bouton **Contacter** ou sur WhatsApp, ou envoyez une demande personnalisée. Nous convenons ensemble de la date, des quantités et des parfums.',
  },
  {
    category: 'traiteur',
    question: 'Faut-il verser un acompte ?',
    answer:
      'Oui. L’acompte est de **10 €** pour une commande de moins de 50 € et de **20 €** à partir de 50 €. La commande est validée à réception de l’acompte. Le solde est réglé au retrait ou à la livraison.',
  },
  {
    category: 'traiteur',
    question: 'L’acompte est-il remboursable ?',
    answer: 'Non : en cas d’annulation de votre part, l’acompte n’est pas remboursé.',
  },
  {
    category: 'formations',
    question: 'Faut-il un compte pour suivre une formation ?',
    answer:
      'Oui. Votre compte vous donne accès aux leçons de votre pack, à votre progression et à votre certificat de fin de formation.',
  },
  {
    category: 'formations',
    question: 'Que contiennent les packs supérieurs ?',
    answer:
      'Chaque pack inclut le contenu des packs précédents : le pack Premium comprend l’Intermédiaire, qui comprend l’Essentiel.',
  },
  {
    category: 'boutique',
    question: 'Puis-je commander un kit sans créer de compte ?',
    answer:
      'Oui, l’achat sans compte est possible. Vous recevez par e-mail un lien pour suivre votre commande.',
  },
  {
    category: 'paiement',
    question: 'Le paiement est-il sécurisé ?',
    answer:
      'Oui. Le paiement se fait sur les pages sécurisées de Stripe ou de PayPal : nous ne voyons ni ne conservons jamais vos données de carte.',
  },
];

async function main(): Promise<void> {
  for (const setting of SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  for (const category of CATEGORIES) {
    await prisma.articleCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  for (const page of PAGES) {
    const body = `# ${page.title}\n\nContenu à rédiger depuis l’administration.`;
    const rendered = markdown.render(body);
    await prisma.staticPage.upsert({
      where: { slug: page.slug },
      update: {},
      create: {
        slug: page.slug,
        title: page.title,
        bodyMarkdown: body,
        bodyHtml: rendered.html,
        toc: [],
        published: false,
      },
    });
  }

  for (const [position, item] of FAQ.entries()) {
    const exists = await prisma.faq.findFirst({
      where: { question: item.question },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.faq.create({
      data: {
        category: item.category,
        question: item.question,
        answerMarkdown: item.answer,
        answerHtml: markdown.render(item.answer).html,
        position,
        published: false,
      },
    });
  }

  await seedCatering(prisma);
  await seedShop(prisma);
  await seedCourses(prisma, markdown);

  console.log('Seed terminé.');
}

main()
  .catch((error: unknown) => {
    console.error('Échec du seed :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
