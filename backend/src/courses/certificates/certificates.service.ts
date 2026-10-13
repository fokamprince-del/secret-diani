import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppConfigService } from '../../config/app-config.service';
import { notFound } from '../../content/common/content.helpers';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DOCUMENTS_QUEUE, type DocumentJobData } from '../../shop/shop.constants';
import { StorageService } from '../../storage/storage.service';
import { PUBLISHED_COURSE } from '../catalog/courses-catalog.service';
import { certificateNumber } from '../domain/courses-domain';
import { renderCertificatePdf } from './certificate-pdf';
import type { CertificateDto, CertificateVerificationDto } from '../dto/courses.dto';

const CERTIFICATE_SELECT = {
  id: true,
  number: true,
  courseTitle: true,
  holderName: true,
  issuedAt: true,
  pdfKey: true,
} satisfies Prisma.CertificateSelect;

/**
 * Certificats de fin de formation : émis quand toutes les leçons publiées sont terminées
 * (nom et prénom requis, figés à l'émission), numéro aléatoire non énumérable, PDF produit par
 * le worker, page publique de vérification. Un certificat révoqué (compte supprimé) n'est plus
 * valide.
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @InjectQueue(DOCUMENTS_QUEUE) private readonly documents: Queue<DocumentJobData>,
    config: AppConfigService,
  ) {
    this.siteUrl = config.get('PUBLIC_SITE_URL').replace(/\/$/, '');
  }

  verificationUrl(number: string): string {
    return `${this.siteUrl}/certificat/${number}`;
  }

  /** Après chaque leçon terminée : certificat si la formation est complète. */
  async onLessonCompleted(userId: string, courseId: string): Promise<void> {
    if (!(await this.isComplete(userId, courseId))) return;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { title: true },
    });
    let number: string | null = null;
    if (user.firstName && user.lastName) {
      number = (
        await this.issue(userId, courseId, `${user.firstName} ${user.lastName}`, course.title)
      ).number;
    }
    await this.mail
      .send('course-completed', user.email, {
        firstName: user.firstName,
        courseTitle: course.title,
        certificateNumber: number,
        link: number
          ? `${this.siteUrl}/espace-membre/certificats`
          : `${this.siteUrl}/espace-membre/profil`,
      })
      .catch((error: unknown) =>
        this.logger.error({ err: error }, 'E-mail de fin de formation non envoyé'),
      );
  }

  /** Demande du certificat après avoir complété son nom (formation déjà terminée). */
  async claim(userId: string, courseSlug: string): Promise<CertificateDto> {
    const course = await this.prisma.course.findFirst({
      where: { ...PUBLISHED_COURSE, slug: courseSlug },
      select: { id: true, title: true },
    });
    if (!course) throw notFound('Formation introuvable.');
    if (!(await this.isComplete(userId, course.id))) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Terminez toutes les leçons pour obtenir le certificat.',
      );
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    if (!user.firstName || !user.lastName) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.PROFILE_INCOMPLETE,
        'Indiquez votre prénom et votre nom dans votre profil : ils figureront sur le certificat.',
      );
    }
    const certificate = await this.issue(
      userId,
      course.id,
      `${user.firstName} ${user.lastName}`,
      course.title,
    );
    return this.toDto(certificate);
  }

  async listMine(userId: string): Promise<CertificateDto[]> {
    const rows = await this.prisma.certificate.findMany({
      where: { userId, revokedAt: null },
      orderBy: { issuedAt: 'desc' },
      select: CERTIFICATE_SELECT,
    });
    return rows.map((row) => this.toDto(row));
  }

  async downloadUrl(userId: string, id: string): Promise<{ url: string }> {
    const row = await this.prisma.certificate.findFirst({
      where: { id, userId, revokedAt: null },
      select: { number: true, pdfKey: true },
    });
    if (!row) throw notFound('Certificat introuvable.');
    if (!row.pdfKey) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.DOCUMENT_NOT_READY,
        'Le certificat est en cours de préparation. Merci de réessayer dans un instant.',
      );
    }
    return { url: await this.storage.presignDownload(row.pdfKey, `certificat-${row.number}.pdf`) };
  }

  /** Vérification publique d'un numéro (page « certificat » du site). */
  async verify(number: string): Promise<CertificateVerificationDto> {
    const row = await this.prisma.certificate.findUnique({
      where: { number },
      select: { holderName: true, courseTitle: true, issuedAt: true, revokedAt: true },
    });
    if (!row) throw notFound('Aucun certificat ne porte ce numéro.');
    const valid = row.revokedAt === null;
    return {
      number,
      valid,
      holderName: valid ? row.holderName : null,
      courseTitle: valid ? row.courseTitle : null,
      issuedAt: valid ? row.issuedAt : null,
    };
  }

  /** Worker : produit et stocke le PDF du certificat (idempotent). */
  async renderPdf(certificateId: string): Promise<void> {
    const row = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      select: {
        number: true,
        holderName: true,
        courseTitle: true,
        issuedAt: true,
        pdfKey: true,
        revokedAt: true,
      },
    });
    if (!row || row.pdfKey || row.revokedAt) return;
    const brand = await this.prisma.appSetting.findUnique({
      where: { key: 'site.name' },
      select: { value: true },
    });
    const pdf = await renderCertificatePdf({
      number: row.number,
      holderName: row.holderName,
      courseTitle: row.courseTitle,
      issuedAt: row.issuedAt,
      brand:
        typeof brand?.value === 'string' && brand.value.trim()
          ? brand.value.trim()
          : 'Les Secrets de Diani',
      verificationUrl: this.verificationUrl(row.number),
    });
    const key = `certificates/${row.issuedAt.getUTCFullYear()}/${row.number}.pdf`;
    await this.storage.put('private', key, pdf, 'application/pdf');
    await this.prisma.certificate.updateMany({
      where: { id: certificateId, pdfKey: null },
      data: { pdfKey: key },
    });
  }

  private async isComplete(userId: string, courseId: string): Promise<boolean> {
    const [total, completed] = await Promise.all([
      this.prisma.lesson.count({ where: { courseId, published: true } }),
      this.prisma.lessonProgress.count({
        where: { userId, completedAt: { not: null }, lesson: { courseId, published: true } },
      }),
    ]);
    return total > 0 && completed >= total;
  }

  /** Émission idempotente (un certificat par cliente et par formation). */
  private async issue(userId: string, courseId: string, holderName: string, courseTitle: string) {
    const existing = await this.prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: CERTIFICATE_SELECT,
    });
    if (existing) return existing;
    const now = new Date();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const certificate = await this.prisma.certificate.create({
          data: {
            number: certificateNumber(now.getUTCFullYear()),
            userId,
            courseId,
            holderName: holderName.slice(0, 200),
            courseTitle,
            issuedAt: now,
          },
          select: CERTIFICATE_SELECT,
        });
        await this.documents.add(
          'certificate-pdf',
          { certificateId: certificate.id },
          { jobId: `certificate-pdf-${certificate.id}` },
        );
        await this.audit.log({
          action: AuditAction.CERTIFICATE_ISSUED,
          actorId: userId,
          targetType: 'certificate',
          targetId: certificate.id,
        });
        return certificate;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
          throw error;
        // Émission simultanée (deux leçons terminées en même temps) : le certificat existe déjà.
        const raced = await this.prisma.certificate.findUnique({
          where: { userId_courseId: { userId, courseId } },
          select: CERTIFICATE_SELECT,
        });
        if (raced) return raced;
        // Sinon, collision de numéro (improbable) : nouveau tirage.
      }
    }
    throw new Error('Émission du certificat impossible');
  }

  private toDto(
    row: Prisma.CertificateGetPayload<{ select: typeof CERTIFICATE_SELECT }>,
  ): CertificateDto {
    return {
      id: row.id,
      number: row.number,
      courseTitle: row.courseTitle,
      holderName: row.holderName,
      issuedAt: row.issuedAt,
      pdfAvailable: row.pdfKey !== null,
      verificationUrl: this.verificationUrl(row.number),
    };
  }
}
