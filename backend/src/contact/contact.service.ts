import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ContactStatus, ContactSubject, Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { ClientContext } from '../common/auth/client-context';
import { CaptchaService } from '../common/captcha/captcha.service';
import { sha256Hex } from '../common/crypto/hash';
import { type CursorPage, toCursorPage } from '../common/pagination/cursor';
import { notFound } from '../content/common/content.helpers';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

export const SUBJECT_LABELS: Record<ContactSubject, string> = {
  general: 'Question générale',
  catering: 'Traiteur',
  courses: 'Formations',
  shop: 'Boutique',
  partnership: 'Partenariat',
  other: 'Autre',
};

export const CONTACT_RECEIVED =
  'Merci ! Votre message est bien reçu : Diani vous répond rapidement.';
const ACKS_PER_DAY = 3;

const MESSAGE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  subject: true,
  message: true,
  status: true,
  adminNote: true,
  handledAt: true,
  createdAt: true,
} as const;

export type ContactMessageView = Prisma.ContactMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

export interface ContactInput {
  name: string;
  email: string;
  phone?: string | null;
  subject: ContactSubject;
  message: string;
  captchaToken?: string;
  website?: string;
}

/**
 * Formulaire de contact : piège à robots, Turnstile, limitation de débit (contrôleur),
 * message conservé pour le suivi, e-mail à Diani (réponse directe à la personne) et accusé
 * de réception (3 par jour au plus pour une même adresse).
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly captcha: CaptchaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async submit(input: ContactInput, client: ClientContext): Promise<{ message: string }> {
    // Piège à robots rempli : réponse identique, rien n'est enregistré ni envoyé.
    if (input.website) return { message: CONTACT_RECEIVED };
    await this.captcha.verify(input.captchaToken, client.ip);
    const saved = await this.prisma.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        subject: input.subject,
        message: input.message,
      },
      select: { id: true },
    });
    await this.audit.log({
      action: AuditAction.CONTACT_RECEIVED,
      targetType: 'contact_message',
      targetId: saved.id,
    });
    try {
      const subject = SUBJECT_LABELS[input.subject];
      await this.mail.sendToAdmins('contact-admin', {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        subject,
        message: input.message,
      });
      if (await this.underAckLimit(input.email)) {
        await this.mail.send('contact-ack', input.email, { name: input.name, subject });
      }
    } catch (error) {
      // Le message est enregistré (visible dans l'administration) : l'e-mail ne doit pas l'annuler.
      this.logger.error({ err: error }, 'Notification de contact non mise en file');
    }
    return { message: CONTACT_RECEIVED };
  }

  // --- Administration ------------------------------------------------------------------------

  async list(query: {
    status?: ContactStatus;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPage<ContactMessageView>> {
    const limit = query.limit ?? 20;
    const rows = await this.prisma.contactMessage.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: MESSAGE_SELECT,
    });
    return toCursorPage(rows, limit);
  }

  async get(id: string): Promise<ContactMessageView> {
    const row = await this.prisma.contactMessage.findUnique({
      where: { id },
      select: MESSAGE_SELECT,
    });
    if (!row) throw notFound('Message introuvable.');
    return row;
  }

  async update(
    id: string,
    data: { status?: ContactStatus; adminNote?: string | null },
    actorId: string,
  ) {
    await this.get(id);
    const handled = data.status === 'answered' || data.status === 'archived';
    await this.prisma.contactMessage.update({
      where: { id },
      data: { ...data, ...(handled ? { handledAt: new Date() } : {}) },
    });
    await this.audit.log({
      action: AuditAction.CONTACT_UPDATED,
      actorId,
      targetType: 'contact_message',
      targetId: id,
    });
    return this.get(id);
  }

  private async underAckLimit(email: string): Promise<boolean> {
    const key = `contact:mail:${sha256Hex(email.toLowerCase())}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 86_400);
    return count <= ACKS_PER_DAY;
  }
}
