import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import type { MarkdownService } from '../../src/content/markdown/markdown.service';

/**
 * Données de référence des formations (cahier des charges §1) : les trois packs et une
 * formation pilote complète (vidéo factice, fiche PDF, conseils, quiz de 3 questions).
 * La formation pilote est créée en BROUILLON : sa vidéo est à remplacer avant publication.
 * Idempotent : un élément existant n'est jamais modifié.
 */
const PACKS = [
  {
    slug: 'essentiel',
    name: 'Essentiel',
    rank: 1,
    priceCents: 2_999,
    callsIncluded: 0,
    summary: 'Les bases solides de la pâtisserie de layer cakes.',
    features: ['Crème au beurre', 'Génoise', 'Lissage', 'Tips secrets'],
  },
  {
    slug: 'intermediaire',
    name: 'Intermédiaire',
    rank: 2,
    priceCents: 5_999,
    callsIncluded: 1,
    summary: 'Pour aller plus loin, avec un accompagnement personnalisé.',
    features: [
      'Chantilly brésilienne',
      'Dégradé de couleurs',
      'Pâte hamburger',
      'Tips secrets',
      '2 fournisseurs offerts',
      '1 appel personnalisé',
    ],
  },
  {
    slug: 'premium',
    name: 'Premium',
    rank: 3,
    priceCents: 19_999,
    callsIncluded: 3,
    summary: 'Tout pour se lancer et vendre ses créations.',
    features: [
      'Organisation d’un buffet de 200 à 300 personnes',
      'Vendre sur les réseaux',
      'Poche à douille',
      'Liste complète des fournisseurs',
      'Tips secrets',
      '3 appels personnalisés',
      'Contenus des packs précédents',
    ],
  },
];

const PILOT_SLUG = 'creme-au-beurre-lisse-et-stable';

function pilotSheet(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 56,
      info: { Title: 'Fiche — Crème au beurre' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(22).fillColor('#5E2F1B').text('Crème au beurre lisse et stable');
    doc.moveDown().fontSize(12).fillColor('#5A504A');
    doc.text(
      'Ingrédients : 250 g de beurre doux à température ambiante, 300 g de sucre glace, 1 c. à c. d’extrait de vanille, 2 c. à s. de lait entier.',
    );
    doc.moveDown().text('1. Fouetter le beurre 5 minutes jusqu’à ce qu’il blanchisse.');
    doc.text('2. Ajouter le sucre glace en trois fois, à petite vitesse.');
    doc.text('3. Incorporer la vanille et le lait, fouetter 3 minutes.');
    doc
      .moveDown()
      .text('Fiche de démonstration générée par le seed : à remplacer par la fiche de Diani.');
    doc.end();
  });
}

/** Dépose la fiche PDF dans le stockage privé ; sans configuration S3, la leçon reste sans fiche. */
async function uploadSheet(prisma: PrismaClient): Promise<string | null> {
  const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_PRIVATE } =
    process.env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET_PRIVATE) {
    console.warn('Stockage S3 non configuré : la formation pilote est créée sans fiche PDF.');
    return null;
  }
  const pdf = await pilotSheet();
  const id = randomUUID();
  const storageKey = `originals/${id}`;
  try {
    await new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION ?? 'gra',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    }).send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_PRIVATE,
        Key: storageKey,
        Body: pdf,
        ContentType: 'application/pdf',
        ContentDisposition: 'attachment',
      }),
    );
  } catch (error) {
    console.warn(
      `Fiche PDF non déposée (${(error as Error).message}) : formation pilote sans fiche.`,
    );
    return null;
  }
  const media = await prisma.media.create({
    data: {
      kind: 'document',
      status: 'ready',
      originalName: 'fiche-creme-au-beurre.pdf',
      mimeType: 'application/pdf',
      sizeBytes: pdf.length,
      storageKey,
      scanResult: 'skipped',
    },
    select: { id: true },
  });
  return media.id;
}

export async function seedCourses(prisma: PrismaClient, markdown: MarkdownService): Promise<void> {
  const packIds = new Map<string, string>();
  for (const pack of PACKS) {
    const row = await prisma.coursePack.upsert({
      where: { slug: pack.slug },
      update: {},
      create: pack,
      select: { id: true },
    });
    packIds.set(pack.slug, row.id);
  }

  if (await prisma.course.findUnique({ where: { slug: PILOT_SLUG }, select: { id: true } })) return;
  const description = [
    'La crème au beurre est la base des layer cakes : elle doit être **lisse**, **stable** et agréable en bouche.',
    '',
    'Dans cette formation pilote, Diani vous montre les gestes essentiels, pas à pas.',
  ].join('\n');
  const tips = [
    '- Sortez le beurre **une heure à l’avance** : il doit être mou, pas fondu.',
    '- Tamisez le sucre glace pour éviter les grumeaux.',
    '- Par temps chaud, placez la crème 10 minutes au frais avant de lisser.',
  ].join('\n');
  const sheetId = await uploadSheet(prisma);

  await prisma.course.create({
    data: {
      slug: PILOT_SLUG,
      title: 'Crème au beurre lisse et stable',
      summary: 'Réussir une crème au beurre lisse, stable et savoureuse pour vos layer cakes.',
      descriptionMarkdown: description,
      descriptionHtml: markdown.render(description).html,
      packId: packIds.get('essentiel')!,
      featured: true,
      status: 'draft',
      modules: {
        create: {
          title: 'Les bases',
          position: 0,
        },
      },
    },
  });
  const course = await prisma.course.findUniqueOrThrow({
    where: { slug: PILOT_SLUG },
    select: { id: true, modules: { select: { id: true } } },
  });
  const moduleId = course.modules[0]!.id;
  const lesson = await prisma.lesson.create({
    data: {
      moduleId,
      courseId: course.id,
      slug: 'la-creme-au-beurre-pas-a-pas',
      title: 'La crème au beurre pas à pas',
      summary: 'Les gestes de base, du beurre pommade à la texture parfaite.',
      // Vidéo factice : identifiant Bunny Stream à remplacer par la vraie vidéo.
      videoId: 'video-pilote-a-remplacer',
      videoDurationSeconds: 420,
      tipsMarkdown: tips,
      tipsHtml: markdown.render(tips).html,
      freePreview: true,
      position: 0,
    },
    select: { id: true },
  });
  if (sheetId) {
    await prisma.lessonResource.create({
      data: {
        lessonId: lesson.id,
        mediaId: sheetId,
        title: 'Fiche recette — crème au beurre',
        watermark: true,
      },
    });
  }
  const questions = [
    {
      prompt: 'Quelle doit être la texture du beurre au départ ?',
      explanation: 'Un beurre pommade (mou, pas fondu) emprisonne l’air et donne une crème lisse.',
      choices: [
        { label: 'Fondu', isCorrect: false },
        { label: 'Mou, à température ambiante', isCorrect: true },
        { label: 'Sortant du réfrigérateur', isCorrect: false },
      ],
    },
    {
      prompt: 'Pourquoi tamiser le sucre glace ?',
      explanation: 'Le tamisage supprime les grumeaux qui rendraient la crème granuleuse.',
      choices: [
        { label: 'Pour éviter les grumeaux', isCorrect: true },
        { label: 'Pour sucrer davantage', isCorrect: false },
        { label: 'Ce n’est pas utile', isCorrect: false },
      ],
    },
    {
      prompt: 'Par temps chaud, que faire avant de lisser ?',
      explanation: 'Quelques minutes au frais raffermissent la crème sans la durcir.',
      choices: [
        { label: 'Ajouter du lait', isCorrect: false },
        { label: 'Placer la crème 10 minutes au frais', isCorrect: true },
        { label: 'Fouetter plus longtemps', isCorrect: false },
      ],
    },
  ];
  await prisma.quiz.create({
    data: {
      lessonId: lesson.id,
      passScorePercent: 67,
      questions: {
        create: questions.map((question, position) => ({
          prompt: question.prompt,
          explanation: question.explanation,
          position,
          choices: {
            create: question.choices.map((choice, index) => ({ ...choice, position: index })),
          },
        })),
      },
    },
  });
}
