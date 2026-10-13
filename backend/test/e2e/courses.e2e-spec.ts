import type { INestApplication } from '@nestjs/common';
import { PDFDocument } from '@cantoo/pdf-lib';
import Stripe from 'stripe';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppConfigService } from '../../src/config/app-config.service';
import { CertificatesService } from '../../src/courses/certificates/certificates.service';
import { WatermarkService } from '../../src/courses/resources/watermark.service';
import { MediaProcessingService } from '../../src/media/media-processing.service';
import { PAYMENT_FETCH } from '../../src/payments/payments.constants';
import { PaymentsService } from '../../src/payments/payments.service';
import { RefundsService } from '../../src/payments/refunds.service';
import { WebhookHandlerService } from '../../src/payments/webhooks/webhook-handler.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { type AdminSession, createAdminSession } from './utils/admin-helpers';
import { API, client, MailInbox, registerVerifiedUser, type Session } from './utils/auth-helpers';
import { FakePaymentProviders } from './utils/fake-payments';
import { createTestApp } from './utils/test-app';

const ADDRESS = {
  firstName: 'Awa',
  lastName: 'Diallo',
  line1: '2 avenue des Roses',
  postalCode: '75011',
  city: 'Paris',
  country: 'FR',
};
const signer = new Stripe('sk_test_signature_only');

describe('Formations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: AdminSession;
  let handler: WebhookHandlerService;
  const fake = new FakePaymentProviders();
  const inbox = new MailInbox();
  const unique = Date.now().toString(36);
  const slug = (name: string) => `${name}-${unique}`;

  let essentielId: string;
  let premiumId: string;
  let courseId: string;
  let premiumCourseId: string;
  let lesson1Id: string;
  let lesson2Id: string;
  let resourceId: string;
  let quizQuestions: { id: string; choices: { id: string; isCorrect: boolean }[] }[];
  let student: Session;

  const pub = () => client(app);
  const lessonUrl = (lesson: string) => `/courses/${slug('creme-au-beurre')}/lessons/${lesson}`;

  async function pdf(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    return Buffer.from(await doc.save());
  }

  /** Achat payé de bout en bout : commande, page Stripe, webhook signé traité par le worker. */
  async function buyPack(session: Session, packSlug: string): Promise<string> {
    const order = await session.http
      .post(`/courses/packs/${packSlug}/checkout`, session.accessToken)
      .send({ billingAddress: ADDRESS, acceptTerms: true })
      .expect(201);
    const started = await pub()
      .post('/payments/checkout')
      .send({ token: order.body.trackingToken, provider: 'stripe' })
      .expect(201);
    const sessionId = (
      await prisma.payment.findUniqueOrThrow({ where: { id: started.body.paymentId } })
    ).providerSessionId!;
    return JSON.stringify({
      orderId: order.body.orderId,
      sessionId,
      paymentId: started.body.paymentId,
    });
  }

  async function confirmPayment(sessionId: string): Promise<void> {
    const payload = JSON.stringify({
      id: `evt_${sessionId}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: fake.sessionJson(fake.markStripePaid(sessionId)) },
    });
    await request(app.getHttpServer())
      .post(`${API}/payments/webhooks/stripe`)
      .set('Content-Type', 'application/json')
      .set(
        'Stripe-Signature',
        signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_e2e0123456789' }),
      )
      .send(payload)
      .expect(200);
    const events = await prisma.webhookEvent.findMany({
      where: { status: 'received' },
      select: { id: true },
    });
    for (const event of events) await handler.process(event.id);
  }

  beforeAll(async () => {
    app = await createTestApp([], [{ provide: PAYMENT_FETCH, useValue: fake.fetch }]);
    prisma = app.get(PrismaService);
    handler = new WebhookHandlerService(prisma, app.get(PaymentsService), app.get(RefundsService));
    const storage = app.get(StorageService);
    await storage.ensureBuckets();
    admin = await createAdminSession(app);

    // Niveaux de packs libres (la base de test peut être réutilisée d'une exécution à l'autre).
    const maxRank = (await prisma.coursePack.aggregate({ _max: { rank: true } }))._max.rank ?? 0;
    const essentiel = await admin.http
      .post('/admin/courses/packs', admin.accessToken)
      .send({
        name: `Essentiel ${unique}`,
        slug: slug('essentiel'),
        priceCents: 2_999,
        rank: maxRank + 1,
        features: ['Crème au beurre'],
      })
      .expect(201);
    essentielId = essentiel.body.id as string;
    const premium = await admin.http
      .post('/admin/courses/packs', admin.accessToken)
      .send({
        name: `Premium ${unique}`,
        slug: slug('premium'),
        priceCents: 19_999,
        rank: maxRank + 2,
        callsIncluded: 3,
        features: ['3 appels personnalisés'],
      })
      .expect(201);
    premiumId = premium.body.id as string;

    const media = await admin.http
      .post('/admin/media', admin.accessToken)
      .attach('file', await pdf(), { filename: 'fiche.pdf', contentType: 'application/pdf' })
      .expect(201);
    await new MediaProcessingService(prisma, storage, app.get(AppConfigService)).process(
      media.body.id as string,
    );

    const course = await admin.http
      .post('/admin/courses', admin.accessToken)
      .send({
        title: `Crème au beurre ${unique}`,
        slug: slug('creme-au-beurre'),
        summary: 'Réussir une crème au beurre lisse.',
        packId: essentielId,
        featured: true,
      })
      .expect(201);
    courseId = course.body.id as string;
    await admin.http.post(`/admin/courses/${courseId}/publish`, admin.accessToken).expect(400);
    let tree = await admin.http
      .post(`/admin/courses/${courseId}/modules`, admin.accessToken)
      .send({ title: 'Les bases' })
      .expect(201);
    const moduleId = tree.body.modules[0].id as string;
    await admin.http
      .post(`/admin/courses/modules/${moduleId}/lessons`, admin.accessToken)
      .send({
        title: 'Pas à pas',
        slug: 'pas-a-pas',
        videoId: 'video-123',
        videoDurationSeconds: 300,
        tipsMarkdown: 'Beurre **mou**.',
        freePreview: true,
      })
      .expect(201);
    tree = await admin.http
      .post(`/admin/courses/modules/${moduleId}/lessons`, admin.accessToken)
      .send({
        title: 'Le lissage',
        slug: 'le-lissage',
        videoId: 'video-456',
        videoDurationSeconds: 240,
      })
      .expect(201);
    lesson1Id = tree.body.modules[0].lessons[0].id as string;
    lesson2Id = tree.body.modules[0].lessons[1].id as string;
    tree = await admin.http
      .put(`/admin/courses/lessons/${lesson2Id}/resources`, admin.accessToken)
      .send({ resources: [{ mediaId: media.body.id, title: 'Fiche lissage', watermark: true }] })
      .expect(200);
    resourceId = tree.body.modules[0].lessons[1].resources[0].id as string;
    await admin.http
      .put(`/admin/courses/lessons/${lesson1Id}/quiz`, admin.accessToken)
      .send({
        maxAttempts: 3,
        questions: [
          {
            prompt: 'Sans bonne réponse',
            choices: [
              { label: 'A', isCorrect: false },
              { label: 'B', isCorrect: false },
            ],
          },
        ],
      })
      .expect(400);
    tree = await admin.http
      .put(`/admin/courses/lessons/${lesson1Id}/quiz`, admin.accessToken)
      .send({
        passScorePercent: 100,
        maxAttempts: 3,
        questions: [
          {
            prompt: 'Le beurre doit être…',
            explanation: 'Mou, pas fondu.',
            choices: [
              { label: 'Fondu', isCorrect: false },
              { label: 'Mou', isCorrect: true },
            ],
          },
          {
            prompt: 'Que tamiser ?',
            choices: [
              { label: 'Le sucre glace', isCorrect: true },
              { label: 'Le beurre', isCorrect: false },
            ],
          },
        ],
      })
      .expect(200);
    quizQuestions = tree.body.modules[0].lessons[0].quiz.questions as typeof quizQuestions;
    await admin.http.post(`/admin/courses/${courseId}/publish`, admin.accessToken).expect(200);

    const premiumCourse = await admin.http
      .post('/admin/courses', admin.accessToken)
      .send({
        title: `Vendre sur les réseaux ${unique}`,
        slug: slug('vendre'),
        summary: 'Se lancer et vendre ses créations.',
        packId: premiumId,
      })
      .expect(201);
    premiumCourseId = premiumCourse.body.id as string;
    const premiumTree = await admin.http
      .post(`/admin/courses/${premiumCourseId}/modules`, admin.accessToken)
      .send({ title: 'Se lancer' })
      .expect(201);
    await admin.http
      .post(
        `/admin/courses/modules/${premiumTree.body.modules[0].id as string}/lessons`,
        admin.accessToken,
      )
      .send({ title: 'Fixer ses prix', slug: 'fixer-ses-prix' })
      .expect(201);
    await admin.http
      .post(`/admin/courses/${premiumCourseId}/publish`, admin.accessToken)
      .expect(200);
  });

  afterAll(async () => {
    await inbox.close();
    await app.close();
  });

  describe('catalogue public', () => {
    it('un pack supérieur liste aussi les formations des packs inférieurs', async () => {
      const res = await pub().get('/courses/packs').expect(200);
      const packs = res.body as { slug: string; courses: { slug: string }[] }[];
      const essentiel = packs.find((pack) => pack.slug === slug('essentiel'))!;
      const premium = packs.find((pack) => pack.slug === slug('premium'))!;
      // La base de test peut contenir d'autres packs : on vérifie les formations de ce test.
      const essentielCourses = essentiel.courses.map((course) => course.slug);
      expect(essentielCourses).toContain(slug('creme-au-beurre'));
      expect(essentielCourses).not.toContain(slug('vendre'));
      expect(premium.courses.map((course) => course.slug)).toEqual(
        expect.arrayContaining([slug('creme-au-beurre'), slug('vendre')]),
      );
    });

    it('fiche formation : programme sans contenu, données structurées Course', async () => {
      const res = await pub()
        .get(`/courses/${slug('creme-au-beurre')}`)
        .expect(200);
      expect(res.body).toMatchObject({
        lessonCount: 2,
        durationMinutes: 9,
        pack: { slug: slug('essentiel') },
      });
      expect(res.body.modules[0].lessons[0]).toMatchObject({
        slug: 'pas-a-pas',
        freePreview: true,
        hasQuiz: true,
      });
      expect(res.body.jsonLd).toMatchObject({
        '@type': 'Course',
        offers: { price: '29.99', priceCurrency: 'EUR' },
      });
      expect(JSON.stringify(res.body)).not.toContain('video-123');
    });

    it('leçon d’exemple ouverte sans compte : vidéo signée, quiz sans les réponses', async () => {
      const res = await pub().get(lessonUrl('pas-a-pas')).expect(200);
      expect(res.body.video.hlsUrl).toMatch(
        /^https:\/\/vz-e2e\.b-cdn\.net\/bcdn_token=[\w-]+&expires=\d+&token_path=%2Fvideo-123%2F\/video-123\/playlist\.m3u8$/,
      );
      expect(new Date(res.body.video.expiresAt as string).getTime()).toBeLessThan(
        Date.now() + 36 * 60_000,
      );
      expect(res.body.tipsHtml).toContain('<strong>mou</strong>');
      expect(res.body.progress).toBeNull();
      expect(JSON.stringify(res.body.quiz)).not.toContain('isCorrect');
      expect(res.body.next).toEqual({ slug: 'le-lissage', title: 'Le lissage' });
    });

    it('leçon payante : compte puis pack exigés (le pack à proposer est indiqué)', async () => {
      await pub().get(lessonUrl('le-lissage')).expect(401);
      const visitor = await registerVerifiedUser(app, inbox);
      const res = await visitor.http.get(lessonUrl('le-lissage'), visitor.accessToken).expect(403);
      expect(res.body).toMatchObject({ code: 'COURSE_ACCESS_REQUIRED' });
      expect(res.body.errors[0].messages[0]).toBe(slug('essentiel'));
      await visitor.http
        .put(`/me/lessons/${lesson2Id}/progress`, visitor.accessToken)
        .send({ positionSeconds: 10 })
        .expect(403);
      await visitor.http
        .get(`/me/lessons/${lesson2Id}/resources/${resourceId}`, visitor.accessToken)
        .expect(403);
    });
  });

  describe('parcours de la cliente (critère d’acceptation)', () => {
    let purchase: { orderId: string; sessionId: string; paymentId: string };

    beforeAll(async () => {
      student = await registerVerifiedUser(app, inbox, { firstName: 'Awa' });
      await student.http.patch('/me', student.accessToken).send({ lastName: 'Diallo' }).expect(200);
    });

    it('achat du pack Premium : accès ouvert uniquement après le webhook de paiement', async () => {
      purchase = JSON.parse(await buyPack(student, slug('premium'))) as typeof purchase;
      // Commande créée, page de paiement ouverte : toujours aucun accès.
      await student.http.get(lessonUrl('le-lissage'), student.accessToken).expect(403);
      expect(await prisma.courseAccess.count({ where: { userId: student.userId } })).toBe(0);

      await confirmPayment(purchase.sessionId);
      expect(
        await prisma.courseAccess.findFirstOrThrow({ where: { userId: student.userId } }),
      ).toMatchObject({
        packId: premiumId,
        source: 'purchase',
        orderId: purchase.orderId,
      });
      // Premium inclut la formation du pack Essentiel.
      await student.http.get(lessonUrl('le-lissage'), student.accessToken).expect(200);
      await student.http
        .get(`/courses/${slug('vendre')}/lessons/fixer-ses-prix`, student.accessToken)
        .expect(200);
      const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { orderId: purchase.orderId },
      });
      expect((invoice.lines as { shippingLabel: string | null }).shippingLabel).toBeNull();
      const mail = await inbox.last(student.email, 'order-confirmed');
      expect(mail.data.coursesLink).toBe('http://localhost:5173/espace-membre');
    });

    it('déjà inscrite : pas de second achat du pack, ni d’un pack inférieur', async () => {
      for (const pack of [slug('premium'), slug('essentiel')]) {
        const res = await student.http
          .post(`/courses/packs/${pack}/checkout`, student.accessToken)
          .send({ billingAddress: ADDRESS, acceptTerms: true })
          .expect(409);
        expect(res.body.code).toBe('ALREADY_ENROLLED');
      }
      await pub()
        .post(`/courses/packs/${slug('premium')}/checkout`)
        .send({ billingAddress: ADDRESS, acceptTerms: true })
        .expect(401);
    });

    it('reprise de lecture : la position est enregistrée et retrouvée', async () => {
      await student.http
        .put(`/me/lessons/${lesson1Id}/progress`, student.accessToken)
        .send({ positionSeconds: 120 })
        .expect(200);
      const res = await student.http.get(lessonUrl('pas-a-pas'), student.accessToken).expect(200);
      expect(res.body.progress).toEqual({
        positionSeconds: 120,
        videoCompleted: false,
        completed: false,
      });
      // Position au-delà de la durée : ramenée à la fin de la vidéo.
      await student.http
        .put(`/me/lessons/${lesson1Id}/progress`, student.accessToken)
        .send({ positionSeconds: 9_000 })
        .expect(200);
      expect(
        (
          await prisma.lessonProgress.findFirstOrThrow({
            where: { userId: student.userId, lessonId: lesson1Id },
          })
        ).positionSeconds,
      ).toBe(300);
    });

    it('vidéo vue mais quiz non réussi : leçon pas encore terminée', async () => {
      const res = await student.http
        .put(`/me/lessons/${lesson1Id}/progress`, student.accessToken)
        .send({ positionSeconds: 300, videoCompleted: true })
        .expect(200);
      expect(res.body).toEqual({ completed: false });
    });

    it('quiz corrigé côté serveur ; réponses masquées tant qu’il reste des tentatives', async () => {
      const wrong = await student.http
        .post(`/me/lessons/${lesson1Id}/quiz`, student.accessToken)
        .send({
          answers: [
            { questionId: quizQuestions[0]!.id, choiceIds: [quizQuestions[0]!.choices[0]!.id] },
          ],
        })
        .expect(200);
      expect(wrong.body).toMatchObject({
        scorePercent: 0,
        passed: false,
        attemptsRemaining: 2,
        lessonCompleted: false,
      });
      expect(
        (wrong.body.questions as { correctChoiceIds: string[] }[]).every(
          (question) => question.correctChoiceIds.length === 0,
        ),
      ).toBe(true);

      const right = await student.http
        .post(`/me/lessons/${lesson1Id}/quiz`, student.accessToken)
        .send({
          answers: quizQuestions.map((question) => ({
            questionId: question.id,
            choiceIds: question.choices
              .filter((choice) => choice.isCorrect)
              .map((choice) => choice.id),
          })),
        })
        .expect(200);
      expect(right.body).toMatchObject({
        scorePercent: 100,
        passed: true,
        attemptsRemaining: 1,
        lessonCompleted: true,
      });
      expect(right.body.questions[0]).toMatchObject({
        correct: true,
        explanation: 'Mou, pas fondu.',
      });
    });

    it('nombre de tentatives limité', async () => {
      await student.http
        .post(`/me/lessons/${lesson1Id}/quiz`, student.accessToken)
        .send({ answers: [] })
        .expect(200);
      const res = await student.http
        .post(`/me/lessons/${lesson1Id}/quiz`, student.accessToken)
        .send({ answers: [] })
        .expect(409);
      expect(res.body.code).toBe('QUIZ_ATTEMPTS_EXHAUSTED');
      // Le meilleur score reste acquis.
      expect(
        (
          await prisma.lessonProgress.findFirstOrThrow({
            where: { userId: student.userId, lessonId: lesson1Id },
          })
        ).quizBestScore,
      ).toBe(100);
    });

    it('fiche PDF filigranée au nom de la cliente, préparée par le worker', async () => {
      const first = await student.http
        .get(`/me/lessons/${lesson2Id}/resources/${resourceId}`, student.accessToken)
        .expect(409);
      expect(first.body.code).toBe('DOCUMENT_NOT_READY');
      await app.get(WatermarkService).render(resourceId, student.userId);
      const res = await student.http
        .get(`/me/lessons/${lesson2Id}/resources/${resourceId}`, student.accessToken)
        .expect(200);
      const download = await fetch(res.body.url as string);
      const stamped = Buffer.from(await download.arrayBuffer());
      expect((await PDFDocument.load(stamped)).getPageCount()).toBe(1);
      expect(stamped.length).toBeGreaterThan((await pdf()).length);
    });

    it('formation terminée : progression à 100 %, certificat, e-mail, vérification publique', async () => {
      await student.http
        .put(`/me/lessons/${lesson2Id}/progress`, student.accessToken)
        .send({ positionSeconds: 240, videoCompleted: true })
        .expect(200, { completed: true });
      const courses = await student.http.get('/me/courses', student.accessToken).expect(200);
      const course = (
        courses.body as {
          slug: string;
          progressPercent: number;
          certificateNumber: string | null;
        }[]
      ).find((entry) => entry.slug === slug('creme-au-beurre'))!;
      expect(course.progressPercent).toBe(100);
      expect(course.certificateNumber).toMatch(/^DIANI-\d{4}-[0-9A-Z]{8}$/);

      const mail = await inbox.last(student.email, 'course-completed');
      expect(mail.data.certificateNumber).toBe(course.certificateNumber);

      const certificates = await student.http
        .get('/me/certificates', student.accessToken)
        .expect(200);
      const certificate = certificates.body[0] as {
        id: string;
        number: string;
        holderName: string;
        pdfAvailable: boolean;
      };
      expect(certificate).toMatchObject({ holderName: 'Awa Diallo', pdfAvailable: false });
      await student.http
        .get(`/me/certificates/${certificate.id}/download`, student.accessToken)
        .expect(409);
      await app.get(CertificatesService).renderPdf(certificate.id);
      const url = await student.http
        .get(`/me/certificates/${certificate.id}/download`, student.accessToken)
        .expect(200);
      expect(
        Buffer.from(await (await fetch(url.body.url as string)).arrayBuffer())
          .subarray(0, 5)
          .toString('latin1'),
      ).toBe('%PDF-');

      const verified = await pub().get(`/certificates/${certificate.number}`).expect(200);
      expect(verified.body).toMatchObject({
        valid: true,
        holderName: 'Awa Diallo',
        courseTitle: `Crème au beurre ${unique}`,
      });
      await pub().get('/certificates/DIANI-2026-ZZZZZZZZ').expect(404);
      await pub().get('/certificates/pas-un-numero').expect(400);

      // Une autre cliente ne télécharge pas ce certificat.
      const other = await registerVerifiedUser(app, inbox);
      await other.http
        .get(`/me/certificates/${certificate.id}/download`, other.accessToken)
        .expect(404);
    });

    it('avantages du pack : appels personnalisés décomptés, administration prévenue', async () => {
      const perks = await student.http.get('/me/perks', student.accessToken).expect(200);
      expect(perks.body).toMatchObject({
        callsIncluded: 3,
        callsRemaining: 3,
        features: ['3 appels personnalisés'],
      });
      await student.http
        .post('/me/call-requests', student.accessToken)
        .send({ message: 'Organisation d’un buffet, mardi soir' })
        .expect(201);
      expect(
        (await student.http.get('/me/perks', student.accessToken).expect(200)).body.callsRemaining,
      ).toBe(2);
      const adminEmail = (await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } }))
        .email;
      expect(await inbox.count(adminEmail, 'call-request-admin')).toBeGreaterThanOrEqual(1);

      const noPack = await registerVerifiedUser(app, inbox);
      const refused = await noPack.http
        .post('/me/call-requests', noPack.accessToken)
        .send({ message: 'Un appel, s’il vous plaît' })
        .expect(409);
      expect(refused.body.code).toBe('NO_CALLS_REMAINING');
    });

    it('statistiques de l’administration', async () => {
      const res = await admin.http.get('/admin/courses/stats', admin.accessToken).expect(200);
      const stats = (
        res.body as {
          courseId: string;
          enrolled: number;
          started: number;
          completed: number;
          completionRate: number;
        }[]
      ).find((entry) => entry.courseId === courseId)!;
      expect(stats.enrolled).toBeGreaterThanOrEqual(1);
      expect(stats.started).toBeGreaterThanOrEqual(1);
      expect(stats.completed).toBeGreaterThanOrEqual(1);
    });

    it('remboursement intégral du pack : accès retiré', async () => {
      await admin.http
        .post(`/admin/shop/orders/${purchase.orderId}/refunds`, admin.accessToken)
        .send({ reason: 'Rétractation' })
        .expect(200);
      await student.http.get(lessonUrl('le-lissage'), student.accessToken).expect(403);
      expect(
        (await prisma.courseAccess.findFirstOrThrow({ where: { orderId: purchase.orderId } }))
          .revokedAt,
      ).not.toBeNull();
    });
  });

  describe('accès accordés par l’administration', () => {
    it('offrir puis retirer un accès', async () => {
      const guest = await registerVerifiedUser(app, inbox);
      const granted = await admin.http
        .post('/admin/courses/accesses', admin.accessToken)
        .send({
          userId: guest.userId,
          packId: essentielId,
          source: 'gift',
          note: 'Concours Instagram',
        })
        .expect(201);
      expect((await inbox.last(guest.email, 'course-access-granted')).data.packName).toBe(
        `Essentiel ${unique}`,
      );
      await guest.http.get(lessonUrl('le-lissage'), guest.accessToken).expect(200);
      // Le pack Essentiel n'ouvre pas la formation Premium.
      await guest.http
        .get(`/courses/${slug('vendre')}/lessons/fixer-ses-prix`, guest.accessToken)
        .expect(403);
      await admin.http
        .post('/admin/courses/accesses', admin.accessToken)
        .send({ userId: guest.userId, packId: essentielId, source: 'gift' })
        .expect(409);
      await admin.http
        .post(`/admin/courses/accesses/${granted.body.id as string}/revoke`, admin.accessToken)
        .send({ note: 'Fin du concours' })
        .expect(204);
      await guest.http.get(lessonUrl('le-lissage'), guest.accessToken).expect(403);
      const cliente = await registerVerifiedUser(app, inbox);
      await cliente.http
        .post('/admin/courses/accesses', cliente.accessToken)
        .send({ userId: guest.userId, packId: essentielId, source: 'gift' })
        .expect(403);
    });
  });

  describe('administration des formations', () => {
    it('packs : modification, niveau déjà pris refusé', async () => {
      const updated = await admin.http
        .patch(`/admin/courses/packs/${premiumId}`, admin.accessToken)
        .send({
          priceCents: 18_999,
          features: ['3 appels personnalisés', 'Liste des fournisseurs'],
        })
        .expect(200);
      expect(updated.body).toMatchObject({
        priceCents: 18_999,
        features: ['3 appels personnalisés', 'Liste des fournisseurs'],
      });
      const adminPacks = await admin.http
        .get('/admin/courses/packs', admin.accessToken)
        .expect(200);
      const essentiel = (adminPacks.body as { id: string; rank: number }[]).find(
        (pack) => pack.id === essentielId,
      )!;
      await admin.http
        .patch(`/admin/courses/packs/${premiumId}`, admin.accessToken)
        .send({ rank: essentiel.rank })
        .expect(409);
      await admin.http
        .patch('/admin/courses/packs/01900000-0000-7000-8000-000000000000', admin.accessToken)
        .send({ visible: false })
        .expect(404);
      // Prix public mis à jour (cache invalidé).
      const packs = await pub().get('/courses/packs').expect(200);
      expect(
        (packs.body as { id: string; priceCents: number }[]).find((pack) => pack.id === premiumId)!
          .priceCents,
      ).toBe(18_999);
    });

    it('modules et leçons : renommer, déplacer, réordonner, supprimer', async () => {
      const draft = await admin.http
        .post('/admin/courses', admin.accessToken)
        .send({
          title: `Brouillon ${unique}`,
          summary: 'Une formation de test en brouillon.',
          packId: essentielId,
        })
        .expect(201);
      const id = draft.body.id as string;
      await admin.http
        .post('/admin/courses', admin.accessToken)
        .send({
          title: 'Doublon',
          slug: draft.body.slug,
          summary: 'Adresse déjà prise ici.',
          packId: essentielId,
        })
        .expect(409);
      await admin.http
        .patch(`/admin/courses/${id}`, admin.accessToken)
        .send({ coverMediaId: '01900000-0000-7000-8000-000000000000' })
        .expect(400);
      await admin.http
        .post(`/admin/courses/${id}/modules`, admin.accessToken)
        .send({ title: 'Module A' })
        .expect(201);
      let tree = await admin.http
        .post(`/admin/courses/${id}/modules`, admin.accessToken)
        .send({ title: 'Module B' })
        .expect(201);
      const [moduleA, moduleB] = tree.body.modules as { id: string }[];
      tree = await admin.http
        .patch(`/admin/courses/modules/${moduleA!.id}`, admin.accessToken)
        .send({ title: 'Module A renommé' })
        .expect(200);
      expect(tree.body.modules[0].title).toBe('Module A renommé');
      tree = await admin.http
        .put(`/admin/courses/${id}/modules/order`, admin.accessToken)
        .send({ ids: [moduleB!.id, moduleA!.id] })
        .expect(200);
      expect((tree.body.modules as { id: string }[]).map((module) => module.id)).toEqual([
        moduleB!.id,
        moduleA!.id,
      ]);
      await admin.http
        .put(`/admin/courses/${id}/modules/order`, admin.accessToken)
        .send({ ids: [moduleA!.id, lesson1Id] })
        .expect(400);

      await admin.http
        .post(`/admin/courses/modules/${moduleA!.id}/lessons`, admin.accessToken)
        .send({ title: 'Leçon 1', slug: 'lecon-1' })
        .expect(201);
      tree = await admin.http
        .post(`/admin/courses/modules/${moduleA!.id}/lessons`, admin.accessToken)
        .send({ title: 'Leçon 2', slug: 'lecon-2' })
        .expect(201);
      await admin.http
        .post(`/admin/courses/modules/${moduleA!.id}/lessons`, admin.accessToken)
        .send({ title: 'Doublon', slug: 'lecon-1' })
        .expect(409);
      const moduleALessons = (
        tree.body.modules as { id: string; lessons: { id: string }[] }[]
      ).find((module) => module.id === moduleA!.id)!.lessons;
      const [l1, l2] = moduleALessons;
      const reordered = await admin.http
        .put(`/admin/courses/modules/${moduleA!.id}/lessons/order`, admin.accessToken)
        .send({ ids: [l2!.id, l1!.id] })
        .expect(200);
      expect(
        (reordered.body.modules as { id: string; lessons: { id: string }[] }[])
          .find((module) => module.id === moduleA!.id)!
          .lessons.map((lesson) => lesson.id),
      ).toEqual([l2!.id, l1!.id]);
      await admin.http
        .delete(`/admin/courses/modules/${moduleA!.id}`, admin.accessToken)
        .expect(409);
      tree = await admin.http
        .patch(`/admin/courses/lessons/${l1!.id}`, admin.accessToken)
        .send({
          moduleId: moduleB!.id,
          title: 'Leçon 1 déplacée',
          tipsMarkdown: 'Astuce **utile**',
          published: false,
        })
        .expect(200);
      const moved = (
        tree.body.modules as {
          id: string;
          lessons: { id: string; title: string; published: boolean }[];
        }[]
      ).find((module) => module.id === moduleB!.id)!.lessons[0]!;
      expect(moved).toMatchObject({ id: l1!.id, title: 'Leçon 1 déplacée', published: false });
      await admin.http
        .patch(`/admin/courses/lessons/${l2!.id}`, admin.accessToken)
        .send({ slug: 'lecon-1' })
        .expect(409);
      // Déplacement vers un module d'une autre formation : refusé.
      const otherCourse = await admin.http
        .get(`/admin/courses/${courseId}`, admin.accessToken)
        .expect(200);
      const foreignModuleId = (otherCourse.body.modules as { id: string }[])[0]!.id;
      await admin.http
        .patch(`/admin/courses/lessons/${l2!.id}`, admin.accessToken)
        .send({ moduleId: foreignModuleId })
        .expect(400);

      await admin.http
        .put(`/admin/courses/lessons/${l2!.id}/quiz`, admin.accessToken)
        .send({
          questions: [
            {
              prompt: 'Question ?',
              choices: [
                { label: 'Oui', isCorrect: true },
                { label: 'Non', isCorrect: false },
              ],
            },
          ],
        })
        .expect(200);
      await admin.http
        .delete(`/admin/courses/lessons/${l2!.id}/quiz`, admin.accessToken)
        .expect(200);
      await admin.http
        .put(`/admin/courses/lessons/${l2!.id}/resources`, admin.accessToken)
        .send({
          resources: [{ mediaId: '01900000-0000-7000-8000-000000000000', title: 'Inconnue' }],
        })
        .expect(400);
      await admin.http.delete(`/admin/courses/lessons/${l2!.id}`, admin.accessToken).expect(200);
      tree = await admin.http
        .delete(`/admin/courses/modules/${moduleA!.id}`, admin.accessToken)
        .expect(200);
      expect(tree.body.modules).toHaveLength(1);

      // Publication possible (leçon publiée), puis dépublication et suppression (aucun certificat).
      await admin.http.post(`/admin/courses/${id}/publish`, admin.accessToken).expect(400);
      await admin.http
        .patch(`/admin/courses/lessons/${l1!.id}`, admin.accessToken)
        .send({ published: true })
        .expect(200);
      await admin.http.post(`/admin/courses/${id}/publish`, admin.accessToken).expect(200);
      await admin.http.post(`/admin/courses/${id}/unpublish`, admin.accessToken).expect(200);
      await admin.http.delete(`/admin/courses/${id}`, admin.accessToken).expect(204);
      await admin.http.get(`/admin/courses/${id}`, admin.accessToken).expect(404);
    });

    it('formations : liste, ordre ; suppression refusée quand des certificats existent', async () => {
      const list = await admin.http.get('/admin/courses', admin.accessToken).expect(200);
      const ids = (list.body as { id: string }[]).map((course) => course.id);
      expect(ids).toEqual(expect.arrayContaining([courseId, premiumCourseId]));
      const reordered = await admin.http
        .put('/admin/courses/order', admin.accessToken)
        .send({ ids: [premiumCourseId, courseId] })
        .expect(200);
      const order = (reordered.body as { id: string }[]).map((course) => course.id);
      expect(order.indexOf(premiumCourseId)).toBeLessThan(order.indexOf(courseId));
      const blocked = await admin.http
        .delete(`/admin/courses/${courseId}`, admin.accessToken)
        .expect(409);
      expect(blocked.body.message).toContain('certificats');
    });

    it('demandes d’appel : liste et planification', async () => {
      const list = await admin.http
        .get('/admin/courses/call-requests?status=requested', admin.accessToken)
        .expect(200);
      const call = (list.body as { id: string }[])[0]!;
      const scheduled = await admin.http
        .patch(`/admin/courses/call-requests/${call.id}`, admin.accessToken)
        .send({
          status: 'scheduled',
          scheduledAt: '2026-11-03T18:00:00.000Z',
          adminNote: 'Appel vidéo',
        })
        .expect(200);
      expect(scheduled.body).toMatchObject({ status: 'scheduled', adminNote: 'Appel vidéo' });
      await admin.http
        .patch(
          '/admin/courses/call-requests/01900000-0000-7000-8000-000000000000',
          admin.accessToken,
        )
        .send({ status: 'done' })
        .expect(404);
    });
  });

  describe('RGPD', () => {
    it('suppression du compte : certificat révoqué, nom retiré de la vérification publique', async () => {
      const exported = await student.http.get('/me/export', student.accessToken).expect(200);
      expect(exported.body.courses.certificates).toHaveLength(1);
      const number = exported.body.courses.certificates[0].number as string;
      await student.http
        .delete('/me', student.accessToken)
        .send({ password: 'Ganache-Mangue-Passion-2026' })
        .expect(204);
      const verified = await pub().get(`/certificates/${number}`).expect(200);
      expect(verified.body).toEqual({
        number,
        valid: false,
        holderName: null,
        courseTitle: null,
        issuedAt: null,
      });
    });
  });
});
