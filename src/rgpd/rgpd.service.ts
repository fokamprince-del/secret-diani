import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { requestReference } from '../catering/domain/request-status';
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
      cateringRequests: cateringRequests.map(({ number, ...request }) => ({
        reference: requestReference(number),
        ...request,
      })),
    };
  }

  /**
   * Suppression du compte : mot de passe exigé, sessions révoquées, données personnelles effacées
   * (anonymisation de la ligne `users`, suppression des adresses, jetons et codes).
   */
  async deleteAccount(
    current: AuthenticatedUser,
    password: string,
    context: ClientContext,
  ): Promise<void> {
    if (current.role === 'admin') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'Un compte administrateur ne peut pas être supprimé depuis l’espace client.',
      );
    }
    const user = await this.auth.verifyCurrentPassword(current.id, password, context);

    await this.sessions.revokeAllForUser(current.id, 'account_deleted');
    await this.prisma.$transaction([
      this.prisma.address.deleteMany({ where: { userId: current.id } }),
      this.prisma.userToken.deleteMany({ where: { userId: current.id } }),
      this.prisma.mfaBackupCode.deleteMany({ where: { userId: current.id } }),
      this.prisma.session.deleteMany({ where: { userId: current.id } }),
      this.prisma.user.update({
        where: { id: current.id },
        data: {
          email: anonymizedEmail(current.id),
          passwordHash: null,
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
