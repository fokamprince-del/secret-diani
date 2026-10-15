import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { requestReference } from '../catering/domain/request-status';
import { orderReference } from '../shop/domain/order-status';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import type { ClientContext } from '../common/auth/client-context';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';

/** Adresse de substitution d'un compte anonymisé (domaine réservé `.invalid`, RFC 2606). */
export function anonymizedEmail(userId: string): string {
  return `supprime-${userId}@anonyme.invalid`;
}

/**
 * Droits RGPD : accès / portabilité (export JSON) et effacement (anonymisation).
 * Les données à conservation légale (factures, 10 ans) seront détachées de l'identité
 * et conservées par les modules commande et facturation (phases 5 et 6).
 */
@Injectable()
export class RgpdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async exportData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        emailVerifiedAt: true,
        totpEnabledAt: true,
        termsAcceptedAt: true,
        termsVersion: true,
        marketingConsentAt: true,
        passwordChangedAt: true,
        lastLoginAt: true,
        createdAt: true,
        addresses: {
          select: {
            type: true,
            label: true,
            firstName: true,
            lastName: true,
            line1: true,
            line2: true,
            postalCode: true,
            city: true,
            country: true,
            phone: true,
            isDefault: true,
            createdAt: true,
          },
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: {
            userAgent: true,
            ipTruncated: true,
            createdAt: true,
            lastUsedAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        },
      },
    });
    const events = await this.prisma.auditLog.findMany({
      where: { OR: [{ actorId: userId }, { targetId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { action: true, ipTruncated: true, createdAt: true },
    });
    // Demandes traiteur envoyées avec la même adresse (formulaire public, sans compte).
    const cateringRequests = await this.prisma.cateringRequest.findMany({
      where: { email: user.email },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        number: true,
        status: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        eventDate: true,
        guestCount: true,
        fulfilment: true,
        deliveryAddress: true,
        message: true,
        agreedTotalCents: true,
        depositCents: true,
        depositReceivedAt: true,
        internalNotes: true,
        createdAt: true,
        items: {
          select: {
            productName: true,
            variantLabel: true,
            quantity: true,
            unitPriceCents: true,
            flavours: true,
          },
        },
      },
    });
    // Commandes boutique du compte (conservées 10 ans avec leur facture, même après suppression).
    // Formations : accès, progression, quiz, certificats, demandes d'appel.
    const [courseAccesses, lessonProgress, quizAttempts, certificates, callRequests] =
      await Promise.all([
        this.prisma.courseAccess.findMany({
          where: { userId },
          select: {
            source: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
            pack: { select: { name: true } },
          },
        }),
        this.prisma.lessonProgress.findMany({
          where: { userId },
          take: 2000,
          select: {
            positionSeconds: true,
            videoCompletedAt: true,
            quizBestScore: true,
            quizPassedAt: true,
            completedAt: true,
            lesson: { select: { title: true, course: { select: { title: true } } } },
          },
        }),
        this.prisma.quizAttempt.findMany({
          where: { userId },
          take: 2000,
          select: { scorePercent: true, passed: true, createdAt: true },
        }),
        this.prisma.certificate.findMany({
          where: { userId },
          select: {
            number: true,
            holderName: true,
            courseTitle: true,
            issuedAt: true,
            revokedAt: true,
          },
        }),
        this.prisma.callRequest.findMany({
          where: { userId },
          select: { status: true, message: true, scheduledAt: true, createdAt: true },
        }),
      ]);
    const [newsletter, contactMessages] = await Promise.all([
      this.prisma.newsletterSubscriber.findUnique({
        where: { email: user.email },
        select: {
          status: true,
          source: true,
          consentText: true,
          requestedAt: true,
          confirmedAt: true,
          unsubscribedAt: true,
        },
      }),
      this.prisma.contactMessage.findMany({
        where: { email: user.email },
        take: 500,
        select: { subject: true, message: true, status: true, createdAt: true },
      }),
    ]);
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        number: true,
        status: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        shippingAddress: true,
        billingAddress: true,
        totalCents: true,
        createdAt: true,
        items: {
          select: { productName: true, variantLabel: true, quantity: true, unitPriceCents: true },
        },
        invoice: { select: { number: true } },
      },
    });
    await this.audit.log({
      action: AuditAction.DATA_EXPORTED,
      actorId: userId,
      targetType: 'user',
      targetId: userId,
    });

    const { addresses, sessions, ...account } = user;
    return {
      exportedAt: new Date().toISOString(),
      controller: 'Les Secrets de Diani',
      account: {
        ...account,
        twoFactorEnabled: account.totpEnabledAt !== null,
        totpEnabledAt: undefined,
      },
      consents: {
        termsAcceptedAt: account.termsAcceptedAt,
        termsVersion: account.termsVersion,
        marketingConsentAt: account.marketingConsentAt,
      },
      addresses,
      sessions,
      securityEvents: events,
      courses: {
        accesses: courseAccesses,
        progress: lessonProgress,
        quizAttempts,
        certificates,
        callRequests,
      },
      newsletter,
      contactMessages,
      orders: orders.map(({ number, invoice, ...order }) => ({
        reference: orderReference(number),
        invoiceNumber: invoice?.number ?? null,
        ...order,
      })),
      cateringRequests: cateringRequests.map(({ number, ...request }) => ({
        reference: requestReference(number),
        ...request,
      })),
    };
  }

  /**
   * Suppression du compte : mot de passe (ou connexion récente pour un compte Google) exigé, sessions révoquées, données personnelles effacées
   * (anonymisation de la ligne `users`, suppression des adresses, jetons et codes).
   */
  async deleteAccount(
    current: AuthenticatedUser,
    password: string | undefined,
    context: ClientContext,
  ): Promise<void> {
    if (current.role === 'admin') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'Un compte administrateur ne peut pas être supprimé depuis l’espace client.',
      );
    }
    const user = await this.auth.confirmIdentity(current, password, context);

    await this.sessions.revokeAllForUser(current.id, 'account_deleted');
    await this.prisma.$transaction([
      this.prisma.address.deleteMany({ where: { userId: current.id } }),
      this.prisma.userToken.deleteMany({ where: { userId: current.id } }),
      this.prisma.mfaBackupCode.deleteMany({ where: { userId: current.id } }),
      // Certificats révoqués : la vérification publique ne montre plus le nom.
      this.prisma.certificate.updateMany({
        where: { userId: current.id },
        data: { holderName: 'Compte supprimé', revokedAt: new Date() },
      }),
      this.prisma.callRequest.deleteMany({ where: { userId: current.id } }),
      // Newsletter et messages de contact liés à l'adresse : effacés avec le compte.
      this.prisma.newsletterSubscriber.deleteMany({ where: { email: user.email } }),
      this.prisma.contactMessage.deleteMany({ where: { email: user.email } }),
      this.prisma.session.deleteMany({ where: { userId: current.id } }),
      this.prisma.user.update({
        where: { id: current.id },
        data: {
          email: anonymizedEmail(current.id),
          passwordHash: null,
          googleSubject: null,
          status: 'deleted',
          deletedAt: new Date(),
          firstName: null,
          lastName: null,
          phone: null,
          totpSecretEnc: null,
          totpEnabledAt: null,
          totpLastStep: null,
          marketingConsentAt: null,
          emailVerifiedAt: null,
        },
      }),
    ]);
    await this.mail.send('account-deleted', user.email, { firstName: user.firstName });
    await this.audit.log({
      action: AuditAction.ACCOUNT_DELETED,
      actorId: current.id,
      targetType: 'user',
      targetId: current.id,
      ipTruncated: context.ipTruncated,
    });
  }
}
