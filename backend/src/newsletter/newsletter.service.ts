import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { NewsletterStatus } from '@prisma/client';
import type Redis from 'ioredis';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { ClientContext } from '../common/auth/client-context';
import { FieldEncryptionService } from '../common/crypto/field-encryption.service';
import { randomToken, sha256Hex } from '../common/crypto/hash';
import { IdSigner } from '../common/crypto/id-signer';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { type CursorPage, toCursorPage } from '../common/pagination/cursor';
import { AppConfigService } from '../config/app-config.service';
import { notFound } from '../content/common/content.helpers';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { toCsv } from '../shop/domain/csv';

/** Texte du consentement affiché sur le formulaire (gardé en preuve avec chaque inscription). */
export const CONSENT_TEXT =
  'J’accepte de recevoir par e-mail les nouvelles des Secrets de Diani (recettes, formations, nouveautés). Désinscription possible à tout moment, en un clic.';
const ACCOUNT_CONSENT_TEXT =
  'Case « recevoir les nouvelles par e-mail » cochée dans le compte (adresse vérifiée).';
const CONFIRM_DAYS = 7;
const CONFIRMATIONS_PER_DAY = 3;

export const SUBSCRIBE_MESSAGE =
  'Merci ! Si cette adresse n’est pas déjà inscrite, un e-mail de confirmation vient de vous être envoyé.';

export interface SubscriberView {
  id: string;
  email: string;
  status: NewsletterStatus;
  source: string;
  requestedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
}

const VIEW_SELECT = {
  id: true,
  email: true,
  status: true,
  source: true,
  requestedAt: true,
  confirmedAt: true,
  unsubscribedAt: true,
} as const;

function invalidLink(): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    ErrorCode.INVALID_TOKEN,
    'Ce lien est invalide ou a expiré.',
  );
}

/**
 * Newsletter en double opt-in : l'inscription n'est active qu'après confirmation par e-mail
 * (lien à usage unique, 7 jours). Réponse identique que l'adresse soit inscrite ou non.
 * Désinscription en un clic par lien signé (sans date d'expiration), aussi depuis les
 * messageries (RFC 8058). Preuve du consentement conservée (texte, dates, IP tronquées).
 */
@Injectable()
export class NewsletterService {
  private readonly signer: IdSigner;
  private readonly siteUrl: string;
  private readonly apiUrl: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    encryption: FieldEncryptionService,
    config: AppConfigService,
  ) {
    this.signer = new IdSigner(encryption.rawKeys, 'diani-newsletter-unsubscribe');
    this.siteUrl = config.get('PUBLIC_SITE_URL').replace(/\/$/, '');
    this.apiUrl = config.get('PUBLIC_API_URL')?.replace(/\/$/, '') ?? null;
  }

  async subscribe(email: string, client: ClientContext): Promise<{ message: string }> {
    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email },
      select: { status: true },
    });
    // Déjà confirmée : rien à faire, et rien qui le révèle.
    if (existing?.status === 'confirmed') return { message: SUBSCRIBE_MESSAGE };
    const token = randomToken();
    const now = new Date();
    const subscriber = await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: {
        email,
        consentText: CONSENT_TEXT,
        requestedAt: now,
        requestIpTruncated: client.ipTruncated,
        confirmTokenHash: sha256Hex(token),
        confirmTokenExpiresAt: new Date(now.getTime() + CONFIRM_DAYS * 86_400_000),
      },
      update: {
        status: 'pending',
        source: 'form',
        consentText: CONSENT_TEXT,
        requestedAt: now,
        requestIpTruncated: client.ipTruncated,
        confirmTokenHash: sha256Hex(token),
        confirmTokenExpiresAt: new Date(now.getTime() + CONFIRM_DAYS * 86_400_000),
        unsubscribedAt: null,
      },
      select: { id: true },
    });
    if (await this.underMailLimit(email)) {
      await this.mail.send('newsletter-confirm', email, {
        confirmLink: `${this.siteUrl}/newsletter/confirmer?token=${token}`,
        ...this.unsubscribeLinks(subscriber.id),
      });
    }
    return { message: SUBSCRIBE_MESSAGE };
  }

  async confirm(token: string, client: ClientContext): Promise<{ message: string }> {
    const subscriber = await this.prisma.newsletterSubscriber.findFirst({
      where: {
        confirmTokenHash: sha256Hex(token),
        status: 'pending',
        confirmTokenExpiresAt: { gt: new Date() },
      },
      select: { id: true, email: true },
    });
    if (!subscriber) throw invalidLink();
    // Consommation atomique : un lien ne confirme qu'une fois.
    const confirmed = await this.prisma.newsletterSubscriber.updateMany({
      where: { id: subscriber.id, status: 'pending' },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
        confirmIpTruncated: client.ipTruncated,
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
      },
    });
    if (confirmed.count === 0) throw invalidLink();
    await this.mail.send(
      'newsletter-welcome',
      subscriber.email,
      this.unsubscribeLinks(subscriber.id),
    );
    return { message: 'Votre inscription à la newsletter est confirmée. Merci !' };
  }

  /** Désinscription en un clic : idempotente, le compte éventuel est mis à jour. */
  async unsubscribe(token: string): Promise<{ message: string }> {
    const id = this.signer.verify(token);
    if (!id) throw invalidLink();
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({
      where: { id },
      select: { email: true, status: true },
    });
    if (subscriber && subscriber.status !== 'unsubscribed') {
      await this.prisma.newsletterSubscriber.update({
        where: { id },
        data: {
          status: 'unsubscribed',
          unsubscribedAt: new Date(),
          confirmTokenHash: null,
          confirmTokenExpiresAt: null,
        },
      });
      await this.prisma.user.updateMany({
        where: { email: subscriber.email },
        data: { marketingConsentAt: null },
      });
    }
    return {
      message: 'Vous êtes désinscrit·e de la newsletter. Vous ne recevrez plus nos nouvelles.',
    };
  }

  /**
   * Préférence cochée dans le compte : l'adresse est déjà vérifiée, l'inscription est
   * confirmée directement ; décochée, la cliente est désinscrite.
   */
  async syncAccount(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true, marketingConsentAt: true },
    });
    if (!user) return;
    const current = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: user.email },
      select: { status: true },
    });
    const now = new Date();
    if (user.marketingConsentAt && user.emailVerifiedAt) {
      if (current?.status === 'confirmed') return;
      await this.prisma.newsletterSubscriber.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          status: 'confirmed',
          source: 'account',
          consentText: ACCOUNT_CONSENT_TEXT,
          requestedAt: user.marketingConsentAt,
          confirmedAt: now,
        },
        update: {
          status: 'confirmed',
          source: 'account',
          consentText: ACCOUNT_CONSENT_TEXT,
          requestedAt: user.marketingConsentAt,
          confirmedAt: now,
          unsubscribedAt: null,
          confirmTokenHash: null,
          confirmTokenExpiresAt: null,
        },
      });
    } else if (!user.marketingConsentAt && current && current.status !== 'unsubscribed') {
      await this.prisma.newsletterSubscriber.update({
        where: { email: user.email },
        data: {
          status: 'unsubscribed',
          unsubscribedAt: now,
          confirmTokenHash: null,
          confirmTokenExpiresAt: null,
        },
      });
    }
  }

  // --- Administration ------------------------------------------------------------------------

  async list(query: {
    status?: NewsletterStatus;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPage<SubscriberView>> {
    const limit = query.limit ?? 50;
    const rows = await this.prisma.newsletterSubscriber.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: VIEW_SELECT,
    });
    return toCursorPage(rows, limit);
  }

  /** Export des abonné·es confirmé·es, avec la preuve du consentement (outil d'envoi externe). */
  async exportCsv(actorId: string): Promise<string> {
    const rows = await this.prisma.newsletterSubscriber.findMany({
      where: { status: 'confirmed' },
      orderBy: { confirmedAt: 'asc' },
      take: 100_000,
      select: {
        email: true,
        source: true,
        requestedAt: true,
        confirmedAt: true,
        consentText: true,
      },
    });
    await this.audit.log({
      action: AuditAction.NEWSLETTER_EXPORTED,
      actorId,
      metadata: { count: rows.length },
    });
    return toCsv(
      ['E-mail', 'Origine', 'Demandé le', 'Confirmé le', 'Consentement'],
      rows.map((row) => [
        row.email,
        row.source === 'account' ? 'Compte' : 'Formulaire',
        row.requestedAt.toISOString(),
        row.confirmedAt?.toISOString() ?? '',
        row.consentText,
      ]),
    );
  }

  /** Effacement sur demande (droit à l'effacement). */
  async remove(id: string, actorId: string): Promise<void> {
    const deleted = await this.prisma.newsletterSubscriber.deleteMany({ where: { id } });
    if (deleted.count === 0) throw notFound('Abonné·e introuvable.');
    await this.audit.log({
      action: AuditAction.NEWSLETTER_SUBSCRIBER_DELETED,
      actorId,
      targetType: 'newsletter_subscriber',
      targetId: id,
    });
  }

  private unsubscribeLinks(id: string): { unsubscribeLink: string; oneClickUrl: string | null } {
    const token = this.signer.sign(id);
    return {
      unsubscribeLink: `${this.siteUrl}/newsletter/desinscription?token=${token}`,
      oneClickUrl: this.apiUrl
        ? `${this.apiUrl}/api/v1/newsletter/unsubscribe/one-click?token=${token}`
        : null,
    };
  }

  /** Anti-bombardement : 3 e-mails de confirmation par jour au plus pour une adresse. */
  private async underMailLimit(email: string): Promise<boolean> {
    const key = `newsletter:mail:${sha256Hex(email.toLowerCase())}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 86_400);
    return count <= CONFIRMATIONS_PER_DAY;
  }
}
