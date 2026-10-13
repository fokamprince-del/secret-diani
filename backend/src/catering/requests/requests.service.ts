import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CateringFulfilment,
  CateringRequestSource,
  CateringRequestStatus,
  Prisma,
} from '@prisma/client';
import type Redis from 'ioredis';
import { AuditAction } from '../../audit/audit-actions';
import { AuditService } from '../../audit/audit.service';
import { CaptchaService } from '../../common/captcha/captcha.service';
import type { ClientContext } from '../../common/auth/client-context';
import { sha256Hex } from '../../common/crypto/hash';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { toCursorPage } from '../../common/pagination/cursor';
import { formatEuros, formatLongDate } from '../../common/utils/money';
import { AppConfigService } from '../../config/app-config.service';
import { fieldError, notFound } from '../../content/common/content.helpers';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { SettingsService } from '../../settings/settings.service';
import { CateringCatalogService } from '../catalog/catalog.service';
import {
  DEPOSIT_BELOW,
  DEPOSIT_FROM,
  DEPOSIT_THRESHOLD,
  MIN_NOTICE_DAYS,
  WHATSAPP_NUMBER,
} from '../catering.settings';
import { computeDeposit, type DepositRule } from '../domain/deposit';
import { eventDateWindow, isRealDate, parisToday } from '../domain/event-date';
import { buildRecap } from '../domain/recap';
import {
  canTransition,
  isFinal,
  nextStatuses,
  parseReference,
  requestReference,
  STATUS_LABELS,
} from '../domain/request-status';
import { requestMessage, whatsappUrl } from '../domain/whatsapp';
import type {
  AdminCateringRequestDto,
  AdminCateringRequestListDto,
  AdminCateringRequestQueryDto,
  AdminCreateCateringRequestDto,
  AdminUpdateCateringRequestDto,
  CateringRequestReceiptDto,
  ChangeRequestStatusDto,
  CreateCateringRequestDto,
  CreateOnlineCateringOrderDto,
  RecapDto,
  RecordDepositDto,
  RequestItemInputDto,
} from '../dto/requests.dto';

/** Confirmations envoyées au plus 3 fois par jour à une même adresse (anti-bombardement). */
const CUSTOMER_MAILS_PER_DAY = 3;

const FULFILMENT_LABELS: Record<CateringFulfilment, string> = {
  pickup: 'retrait',
  delivery: 'livraison',
};

const SOURCE_LABELS: Record<CateringRequestSource, string> = {
  form: 'formulaire du site',
  online: 'commande en ligne',
  admin: 'saisie par l’administration',
};

const RECEIPT_MESSAGE =
  'Merci ! Votre demande est bien reçue : Diani vous recontacte rapidement pour en convenir les détails.';

const DETAIL_SELECT = {
  id: true,
  number: true,
  source: true,
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
  estimatedTotalCents: true,
  agreedTotalCents: true,
  depositCents: true,
  depositReceivedAt: true,
  depositMethod: true,
  confirmedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  internalNotes: true,
  createdAt: true,
  slot: { select: { id: true, fulfilment: true, startsAt: true, endsAt: true, capacity: true } },
  items: {
    orderBy: { position: 'asc' },
    select: {
      productName: true,
      variantLabel: true,
      unitPriceCents: true,
      quantity: true,
      flavours: true,
    },
  },
  events: {
    orderBy: { createdAt: 'asc' },
    select: { fromStatus: true, toStatus: true, actorId: true, note: true, createdAt: true },
  },
} satisfies Prisma.CateringRequestSelect;

type DetailRow = Prisma.CateringRequestGetPayload<{ select: typeof DETAIL_SELECT }>;

interface ResolvedItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  unitPriceCents: number;
  quantity: number;
  flavours: string[];
  position: number;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function itemLine(
  item: Pick<
    ResolvedItem,
    'quantity' | 'productName' | 'variantLabel' | 'unitPriceCents' | 'flavours'
  >,
): string {
  const flavours = item.flavours.length > 0 ? ` — parfums : ${item.flavours.join(', ')}` : '';
  return `${item.quantity} × ${item.productName} (${item.variantLabel}) : ${formatEuros(item.unitPriceCents * item.quantity)}${flavours}`;
}

function transitionRefused(from: CateringRequestStatus, to: CateringRequestStatus): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.INVALID_STATUS_TRANSITION,
    `Impossible de passer une demande « ${STATUS_LABELS[from]} » à « ${STATUS_LABELS[to]} ».`,
  );
}

/**
 * Demandes traiteur : formulaire public (« Demande personnalisée »), commande en ligne
 * (parcours avancé, désactivé par défaut) et suivi par l'administration (statuts, acompte,
 * confirmation, récapitulatif).
 */
@Injectable()
export class CateringRequestsService {
  private readonly logger = new Logger(CateringRequestsService.name);
  private readonly onlineOrdering: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly catalog: CateringCatalogService,
    private readonly mail: MailService,
    private readonly captcha: CaptchaService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: AppConfigService,
  ) {
    this.onlineOrdering = config.get('CATERING_ONLINE_ORDERING');
  }

  // --- Public ---------------------------------------------------------------------------------

  async createFromForm(
    dto: CreateCateringRequestDto,
    client: ClientContext,
  ): Promise<CateringRequestReceiptDto> {
    // Piège à robots rempli : réponse identique à un succès, rien n'est enregistré ni envoyé.
    if (dto.website) {
      this.logger.log('Demande traiteur ignorée (piège à robots rempli)');
      return {
        reference: requestReference(0),
        message: RECEIPT_MESSAGE,
        estimatedTotalCents: null,
        whatsappUrl: null,
      };
    }
    await this.captcha.verify(dto.captchaToken, client.ip);
    await this.assertEventDate(dto.eventDate, false);
    const items = await this.resolveItems(dto.items ?? [], false);
    const request = await this.prisma.$transaction((tx) =>
      this.insert(tx, dto, items, { source: 'form', actorId: null }),
    );
    return this.afterCreate(request, items);
  }

  async createOnlineOrder(
    dto: CreateOnlineCateringOrderDto,
    client: ClientContext,
  ): Promise<CateringRequestReceiptDto> {
    this.assertOnlineOrdering();
    if (dto.website) {
      return {
        reference: requestReference(0),
        message: RECEIPT_MESSAGE,
        estimatedTotalCents: null,
        whatsappUrl: null,
      };
    }
    await this.captcha.verify(dto.captchaToken, client.ip);
    if (!dto.items?.length) throw fieldError('items', 'choisissez au moins un produit');
    if (!dto.fulfilment) throw fieldError('fulfilment', 'choisissez le retrait ou la livraison');
    await this.assertEventDate(dto.eventDate, false);
    const items = await this.resolveItems(dto.items, false);
    const rule = await this.depositRule();

    const request = await this.prisma.$transaction(async (tx) => {
      // Verrou du créneau : deux commandes simultanées ne dépassent jamais sa capacité.
      const [slot] = await tx.$queryRaw<
        { fulfilment: CateringFulfilment; starts_at: Date; capacity: number; active: boolean }[]
      >`SELECT fulfilment, starts_at, capacity, active FROM catering_slots WHERE id = ${dto.slotId}::uuid FOR UPDATE`;
      if (!slot || !slot.active || slot.starts_at <= new Date()) throw this.slotUnavailable();
      if (slot.fulfilment !== dto.fulfilment) {
        throw fieldError('slotId', 'ce créneau ne correspond pas au mode choisi');
      }
      if (parisToday(slot.starts_at) !== dto.eventDate) {
        throw fieldError('eventDate', 'doit correspondre à la date du créneau');
      }
      const taken = await tx.cateringRequest.count({
        where: { slotId: dto.slotId, status: { not: 'cancelled' } },
      });
      if (taken >= slot.capacity) throw this.slotUnavailable();
      const total = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
      return this.insert(tx, dto, items, {
        source: 'online',
        actorId: null,
        slotId: dto.slotId,
        agreedTotalCents: total,
        depositCents: computeDeposit(total, rule),
      });
    });
    return this.afterCreate(request, items);
  }

  // --- Administration -------------------------------------------------------------------------

  async createByAdmin(
    dto: AdminCreateCateringRequestDto,
    actorId: string,
  ): Promise<AdminCateringRequestDto> {
    await this.assertEventDate(dto.eventDate, true);
    const items = await this.resolveItems(dto.items ?? [], true);
    const request = await this.prisma.$transaction((tx) =>
      this.insert(tx, dto, items, {
        source: 'admin',
        actorId,
        internalNotes: dto.internalNotes ?? null,
      }),
    );
    return this.get(request.id);
  }

  async list(query: AdminCateringRequestQueryDto): Promise<AdminCateringRequestListDto> {
    const limit = query.limit ?? 20;
    const where: Prisma.CateringRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            eventDate: {
              ...(query.from ? { gte: new Date(`${query.from.slice(0, 10)}T00:00:00Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to.slice(0, 10)}T00:00:00Z`) } : {}),
            },
          }
        : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    if (query.q) {
      const number = parseReference(query.q);
      if (number !== null) where.number = number;
      else if (query.q.includes('@')) where.email = query.q;
      else {
        where.OR = [
          { firstName: { contains: query.q, mode: 'insensitive' } },
          { lastName: { contains: query.q, mode: 'insensitive' } },
        ];
      }
    }
    const rows = await this.prisma.cateringRequest.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        number: true,
        source: true,
        status: true,
        firstName: true,
        lastName: true,
        eventDate: true,
        guestCount: true,
        estimatedTotalCents: true,
        agreedTotalCents: true,
        createdAt: true,
      },
    });
    const page = toCursorPage(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map(({ number, eventDate, ...row }) => ({
        ...row,
        reference: requestReference(number),
        eventDate: isoDate(eventDate),
      })),
    };
  }

  async get(id: string): Promise<AdminCateringRequestDto> {
    const row = await this.prisma.cateringRequest.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound('Demande introuvable.');
    const [rule, whatsapp, taken] = await Promise.all([
      this.depositRule(),
      this.settings.get(WHATSAPP_NUMBER),
      row.slot
        ? this.prisma.cateringRequest.count({
            where: { slotId: row.slot.id, status: { not: 'cancelled' } },
          })
        : Promise.resolve(0),
    ]);
    return this.toDetail(
      row,
      rule,
      whatsapp,
      row.slot ? Math.max(row.slot.capacity - taken, 0) : 0,
    );
  }

  async update(
    id: string,
    dto: AdminUpdateCateringRequestDto,
    actorId: string,
  ): Promise<AdminCateringRequestDto> {
    const current = await this.prisma.cateringRequest.findUnique({
      where: { id },
      select: { status: true, agreedTotalCents: true, fulfilment: true, deliveryAddress: true },
    });
    if (!current) throw notFound('Demande introuvable.');
    // Champs réellement fournis (les propriétés absentes du corps existent, à `undefined`).
    const provided = Object.entries(dto).filter(([, value]) => value !== undefined);
    const onlyNotes = provided.every(([key]) => key === 'internalNotes');
    if (isFinal(current.status) && !onlyNotes) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Une demande livrée ou annulée ne peut plus être modifiée (notes internes exceptées).',
      );
    }
    const depositLocked = ['deposit_received', 'confirmed', 'delivered'].includes(current.status);
    if (
      depositLocked &&
      dto.agreedTotalCents !== undefined &&
      dto.agreedTotalCents !== current.agreedTotalCents
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Le total est figé une fois l’acompte reçu.',
      );
    }
    if (depositLocked && dto.agreedTotalCents === null) {
      throw fieldError('agreedTotalCents', 'ne peut pas être effacé après réception de l’acompte');
    }
    if (dto.eventDate !== undefined) await this.assertEventDate(dto.eventDate, true);
    const fulfilment = dto.fulfilment !== undefined ? dto.fulfilment : current.fulfilment;
    const address =
      dto.deliveryAddress !== undefined ? dto.deliveryAddress : current.deliveryAddress;
    if (address && fulfilment !== 'delivery') {
      throw fieldError('deliveryAddress', 'seulement pour une livraison');
    }

    await this.prisma.cateringRequest.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.eventDate !== undefined
          ? { eventDate: new Date(`${dto.eventDate}T00:00:00Z`) }
          : {}),
      },
    });
    await this.audit.log({
      action: AuditAction.CATERING_REQUEST_UPDATED,
      actorId,
      targetType: 'catering_request',
      targetId: id,
    });
    return this.get(id);
  }

  /** Enregistre l'acompte reçu : montant calculé sur le total convenu (10 € / 20 € par défaut). */
  async recordDeposit(
    id: string,
    dto: RecordDepositDto,
    actorId: string,
  ): Promise<AdminCateringRequestDto> {
    const current = await this.prisma.cateringRequest.findUnique({
      where: { id },
      select: { status: true, agreedTotalCents: true },
    });
    if (!current) throw notFound('Demande introuvable.');
    if (!canTransition(current.status, 'deposit_received')) {
      throw transitionRefused(current.status, 'deposit_received');
    }
    const total = dto.agreedTotalCents ?? current.agreedTotalCents;
    if (total === null || total === undefined) {
      throw fieldError('agreedTotalCents', 'indiquez le total convenu avec la cliente');
    }
    const depositCents = computeDeposit(total, await this.depositRule());

    await this.prisma.$transaction(async (tx) => {
      // Mise à jour conditionnelle : deux enregistrements simultanés n'en font qu'un.
      const updated = await tx.cateringRequest.updateMany({
        where: { id, status: current.status },
        data: {
          status: 'deposit_received',
          agreedTotalCents: total,
          depositCents,
          depositReceivedAt: new Date(),
          depositMethod: dto.method,
        },
      });
      if (updated.count === 0) throw transitionRefused(current.status, 'deposit_received');
      await tx.cateringRequestEvent.create({
        data: {
          requestId: id,
          fromStatus: current.status,
          toStatus: 'deposit_received',
          actorId,
          note: `Acompte de ${formatEuros(depositCents)} reçu (${dto.method})`,
        },
      });
      await this.audit.log(
        {
          action: AuditAction.CATERING_DEPOSIT_RECORDED,
          actorId,
          targetType: 'catering_request',
          targetId: id,
          metadata: { depositCents, agreedTotalCents: total },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async changeStatus(
    id: string,
    dto: ChangeRequestStatusDto,
    actorId: string,
  ): Promise<AdminCateringRequestDto> {
    const current = await this.prisma.cateringRequest.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!current) throw notFound('Demande introuvable.');
    if (!canTransition(current.status, dto.status))
      throw transitionRefused(current.status, dto.status);
    if (dto.status === 'cancelled' && !dto.note) {
      throw fieldError('note', 'indiquez le motif de l’annulation');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cateringRequest.updateMany({
        where: { id, status: current.status },
        data: {
          status: dto.status,
          ...(dto.status === 'confirmed' ? { confirmedAt: now } : {}),
          ...(dto.status === 'delivered' ? { deliveredAt: now } : {}),
          ...(dto.status === 'cancelled'
            ? { cancelledAt: now, cancellationReason: dto.note ?? null }
            : {}),
        },
      });
      if (updated.count === 0) throw transitionRefused(current.status, dto.status);
      await tx.cateringRequestEvent.create({
        data: {
          requestId: id,
          fromStatus: current.status,
          toStatus: dto.status,
          actorId,
          note: dto.note ?? null,
        },
      });
      await this.audit.log(
        {
          action: AuditAction.CATERING_REQUEST_STATUS_CHANGED,
          actorId,
          targetType: 'catering_request',
          targetId: id,
          metadata: { from: current.status, to: dto.status },
        },
        tx,
      );
    });

    if (dto.status === 'confirmed') await this.sendConfirmation(current);
    return this.get(id);
  }

  async recap(id: string): Promise<RecapDto> {
    const row = await this.prisma.cateringRequest.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound('Demande introuvable.');
    const [rule, conditions] = await Promise.all([this.depositRule(), this.catalog.conditions()]);
    const depositCents =
      row.depositCents ??
      (row.agreedTotalCents !== null ? computeDeposit(row.agreedTotalCents, rule) : null);
    return { text: buildRecap({ ...row, depositCents }, conditions.items) };
  }

  // --- Interne --------------------------------------------------------------------------------

  private assertOnlineOrdering(): void {
    if (!this.onlineOrdering) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FEATURE_DISABLED,
        'La commande en ligne n’est pas encore ouverte : envoyez-nous une demande personnalisée.',
      );
    }
  }

  private slotUnavailable(): AppException {
    return new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.SLOT_UNAVAILABLE,
      'Ce créneau n’est plus disponible. Merci d’en choisir un autre.',
      [{ field: 'slotId', messages: ['plus disponible'] }],
    );
  }

  /** Date réelle, dans la fenêtre acceptée (délai minimal, au plus un an) ; l'admin n'a pas de délai. */
  private async assertEventDate(eventDate: string, byAdmin: boolean): Promise<void> {
    if (!isRealDate(eventDate)) throw fieldError('eventDate', 'cette date n’existe pas');
    if (byAdmin) return;
    const window = eventDateWindow(new Date(), await this.settings.get(MIN_NOTICE_DAYS));
    if (eventDate < window.min) {
      throw fieldError(
        'eventDate',
        `doit être au plus tôt le ${formatLongDate(new Date(`${window.min}T00:00:00Z`))}`,
      );
    }
    if (eventDate > window.max) throw fieldError('eventDate', 'doit être dans moins d’un an');
  }

  /** Sélection : variantes de produits publiés (ou non supprimés pour l'admin), parfums autorisés. */
  private async resolveItems(
    items: RequestItemInputDto[],
    byAdmin: boolean,
  ): Promise<ResolvedItem[]> {
    if (items.length === 0) return [];
    const variants = await this.prisma.cateringVariant.findMany({
      where: {
        id: { in: items.map((item) => item.variantId) },
        product: byAdmin
          ? { deletedAt: null }
          : { deletedAt: null, visible: true, category: { visible: true } },
      },
      select: {
        id: true,
        label: true,
        priceCents: true,
        product: {
          select: {
            id: true,
            name: true,
            maxFlavours: true,
            flavours: {
              where: byAdmin ? {} : { flavour: { visible: true } },
              select: { flavour: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    return items.map((item, index) => {
      const variant = variants.find((candidate) => candidate.id === item.variantId);
      if (!variant)
        throw fieldError(`items.${index}.variantId`, 'produit introuvable ou indisponible');
      const flavourIds = item.flavourIds ?? [];
      if (flavourIds.length > variant.product.maxFlavours) {
        throw fieldError(
          `items.${index}.flavourIds`,
          variant.product.maxFlavours === 0
            ? 'ce produit ne se choisit pas par parfum'
            : `au plus ${variant.product.maxFlavours} parfum(s)`,
        );
      }
      const flavours = flavourIds.map((flavourId) => {
        const found = variant.product.flavours.find(({ flavour }) => flavour.id === flavourId);
        if (!found)
          throw fieldError(`items.${index}.flavourIds`, 'parfum indisponible pour ce produit');
        return found.flavour.name;
      });
      return {
        productId: variant.product.id,
        variantId: variant.id,
        productName: variant.product.name,
        variantLabel: variant.label,
        unitPriceCents: variant.priceCents,
        quantity: item.quantity,
        flavours,
        position: index,
      };
    });
  }

  private insert(
    tx: Prisma.TransactionClient,
    dto: CreateCateringRequestDto | AdminCreateCateringRequestDto,
    items: ResolvedItem[],
    extra: {
      source: CateringRequestSource;
      actorId: string | null;
      slotId?: string;
      agreedTotalCents?: number;
      depositCents?: number;
      internalNotes?: string | null;
    },
  ) {
    if (dto.deliveryAddress && dto.fulfilment !== 'delivery') {
      throw fieldError('deliveryAddress', 'seulement pour une livraison');
    }
    const estimated =
      items.length > 0
        ? items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0)
        : null;
    return tx.cateringRequest.create({
      data: {
        source: extra.source,
        firstName: dto.firstName,
        lastName: dto.lastName ?? null,
        email: dto.email,
        phone: dto.phone ?? null,
        eventDate: new Date(`${dto.eventDate}T00:00:00Z`),
        guestCount: dto.guestCount ?? null,
        fulfilment: dto.fulfilment ?? null,
        deliveryAddress: dto.deliveryAddress ?? null,
        message: dto.message ?? null,
        estimatedTotalCents: estimated,
        agreedTotalCents: extra.agreedTotalCents ?? null,
        depositCents: extra.depositCents ?? null,
        internalNotes: extra.internalNotes ?? null,
        slotId: extra.slotId ?? null,
        items: { create: items },
        events: { create: { toStatus: 'new', actorId: extra.actorId } },
      },
      select: {
        id: true,
        number: true,
        source: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        eventDate: true,
        guestCount: true,
        fulfilment: true,
        message: true,
        estimatedTotalCents: true,
      },
    });
  }

  private async afterCreate(
    request: Awaited<ReturnType<CateringRequestsService['insert']>>,
    items: ResolvedItem[],
  ): Promise<CateringRequestReceiptDto> {
    const reference = requestReference(request.number);
    const eventDate = formatLongDate(request.eventDate);
    await this.audit.log({
      action: AuditAction.CATERING_REQUEST_CREATED,
      targetType: 'catering_request',
      targetId: request.id,
      metadata: { source: request.source },
    });
    await this.notify(request, reference, eventDate, items);
    const whatsapp = await this.settings.get(WHATSAPP_NUMBER);
    return {
      reference,
      message: RECEIPT_MESSAGE,
      estimatedTotalCents: request.estimatedTotalCents,
      whatsappUrl: whatsappUrl(whatsapp, requestMessage(reference, eventDate)),
    };
  }

  /** E-mails : accusé de réception (limité par adresse) et notification à l'administration. */
  private async notify(
    request: Awaited<ReturnType<CateringRequestsService['insert']>>,
    reference: string,
    eventDate: string,
    items: ResolvedItem[],
  ): Promise<void> {
    const itemLines = items.map((item) => `– ${itemLine(item)}`);
    const estimatedTotal =
      request.estimatedTotalCents !== null ? formatEuros(request.estimatedTotalCents) : null;
    try {
      if (await this.underCustomerMailLimit(request.email)) {
        const conditions = await this.catalog.conditions();
        await this.mail.send('catering-request-received', request.email, {
          firstName: request.firstName,
          reference,
          eventDate,
          itemLines,
          estimatedTotal,
          conditions: conditions.items,
        });
      }
      await this.mail.sendToAdmins('catering-request-admin', {
        reference,
        source: SOURCE_LABELS[request.source],
        customerName: [request.firstName, request.lastName].filter(Boolean).join(' '),
        email: request.email,
        phone: request.phone,
        eventDate,
        guestCount: request.guestCount,
        fulfilment: request.fulfilment ? FULFILMENT_LABELS[request.fulfilment] : null,
        itemLines,
        estimatedTotal,
        message: request.message,
      });
    } catch (error) {
      // La demande est enregistrée : une file indisponible ne doit pas la faire échouer.
      this.logger.error({ err: error }, 'Notification de demande traiteur non mise en file');
    }
  }

  private async underCustomerMailLimit(email: string): Promise<boolean> {
    const key = `catering:mail:${sha256Hex(email.toLowerCase())}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 24 * 3600);
    return count <= CUSTOMER_MAILS_PER_DAY;
  }

  private async sendConfirmation(request: DetailRow): Promise<void> {
    if (request.agreedTotalCents === null || request.depositCents === null) return;
    const conditions = await this.catalog.conditions();
    await this.mail.send('catering-order-confirmed', request.email, {
      firstName: request.firstName,
      reference: requestReference(request.number),
      eventDate: formatLongDate(request.eventDate),
      total: formatEuros(request.agreedTotalCents),
      deposit: formatEuros(request.depositCents),
      balance: formatEuros(request.agreedTotalCents - request.depositCents),
      conditions: conditions.items,
    });
  }

  private async depositRule(): Promise<DepositRule> {
    const [thresholdCents, belowCents, fromCents] = await this.settings.getMany([
      DEPOSIT_THRESHOLD,
      DEPOSIT_BELOW,
      DEPOSIT_FROM,
    ] as const);
    return { thresholdCents, belowCents, fromCents };
  }

  private toDetail(
    row: DetailRow,
    rule: DepositRule,
    whatsapp: string,
    slotRemaining: number,
  ): AdminCateringRequestDto {
    const depositCents =
      row.depositCents ??
      (row.agreedTotalCents !== null ? computeDeposit(row.agreedTotalCents, rule) : null);
    const { number, eventDate, slot, ...rest } = row;
    return {
      ...rest,
      reference: requestReference(number),
      eventDate: isoDate(eventDate),
      depositCents,
      balanceCents:
        row.agreedTotalCents !== null && depositCents !== null
          ? row.agreedTotalCents - depositCents
          : null,
      slot: slot
        ? {
            id: slot.id,
            fulfilment: slot.fulfilment,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            remaining: slotRemaining,
          }
        : null,
      nextStatuses: [...nextStatuses(row.status)],
      customerWhatsappUrl: row.phone
        ? whatsappUrl(
            row.phone,
            `Bonjour ${row.firstName}, c’est Diani au sujet de votre demande ${requestReference(number)}.`,
          )
        : null,
    };
  }
}
