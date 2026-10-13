import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { invoiceNumber, orderReference } from '../domain/order-status';
import type { Seller } from '../shop.settings';
import { type InvoicePdfInput, renderInvoicePdf } from './invoice-pdf';

/** Adresse figée dans une commande (JSON). */
export interface StoredAddress {
  firstName: string;
  lastName: string;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
}

interface InvoiceLine {
  description: string;
  sku: string | null;
  quantity: number;
  unitPriceCents: number;
}

/**
 * Factures : émises dans la transaction du paiement, numérotées sans trou par année
 * (« F-2026-00001 »), contenu figé à l'émission puis inaltérable (déclencheur en base,
 * conservation 10 ans). Le PDF est produit par le worker et stocké dans le bucket privé.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Émet la facture d'une commande payée. Le numéro est pris dans la même transaction que le
   * paiement : en cas d'échec, l'incrément est annulé avec elle (numérotation continue).
   */
  async issue(
    tx: Prisma.TransactionClient,
    orderId: string,
    seller: Seller,
    issuedAt: Date,
  ): Promise<{ id: string; number: string }> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        number: true,
        email: true,
        firstName: true,
        lastName: true,
        billingAddress: true,
        shippingRateName: true,
        shippingMethod: true,
        subtotalCents: true,
        shippingCents: true,
        totalCents: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            productName: true,
            variantLabel: true,
            sku: true,
            quantity: true,
            unitPriceCents: true,
          },
        },
      },
    });
    const year = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric' }).format(
        issuedAt,
      ),
    );
    const [counter] = await tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO invoice_sequences (year, last_number) VALUES (${year}, 1)
      ON CONFLICT (year) DO UPDATE SET last_number = invoice_sequences.last_number + 1
      RETURNING last_number`;
    const sequence = counter!.last_number;
    const number = invoiceNumber(year, sequence);
    const billing = order.billingAddress as unknown as StoredAddress;
    const lines: InvoiceLine[] = order.items.map((item) => ({
      description: `${item.productName} (${item.variantLabel})`,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    }));
    const invoice = await tx.invoice.create({
      data: {
        orderId,
        number,
        year,
        sequence,
        issuedAt,
        seller: { ...seller, orderReference: orderReference(order.number) },
        buyer: {
          name: `${billing.firstName} ${billing.lastName}`,
          email: order.email,
          address: billing as unknown as Prisma.InputJsonObject,
        },
        lines: {
          items: lines,
          shippingLabel:
            order.shippingMethod === 'digital' ? null : `Livraison : ${order.shippingRateName}`,
        } as unknown as Prisma.InputJsonValue,
        subtotalCents: order.subtotalCents,
        shippingCents: order.shippingCents,
        totalCents: order.totalCents,
        vatMention: seller.vatMention,
      },
      select: { id: true, number: true },
    });
    return invoice;
  }

  /** Produit et stocke le PDF (worker). Idempotent : un PDF déjà posé n'est pas refait. */
  async renderPdf(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.pdfKey) return;
    const seller = invoice.seller as unknown as Seller & { orderReference: string };
    const buyer = invoice.buyer as unknown as { name: string; address: StoredAddress };
    const lines = invoice.lines as unknown as {
      items: InvoiceLine[];
      shippingLabel: string | null;
    };
    const input: InvoicePdfInput = {
      number: invoice.number,
      issuedAt: invoice.issuedAt,
      orderReference: seller.orderReference,
      seller: {
        name: seller.name,
        lines: [seller.legalForm, seller.address].filter((line) => line.length > 0),
        siret: seller.siret,
        email: seller.email,
      },
      buyer: {
        name: buyer.name,
        lines: [
          buyer.address.line1,
          buyer.address.line2 ?? '',
          `${buyer.address.postalCode} ${buyer.address.city}`,
          buyer.address.country,
        ].filter((line) => line.length > 0),
      },
      lines: lines.items,
      subtotalCents: invoice.subtotalCents,
      shippingCents: invoice.shippingCents,
      shippingLabel: lines.shippingLabel,
      totalCents: invoice.totalCents,
      vatMention: invoice.vatMention,
    };
    const pdf = await renderInvoicePdf(input);
    const key = `invoices/${invoice.year}/${invoice.number}.pdf`;
    await this.storage.put('private', key, pdf, 'application/pdf');
    // Seule modification permise par le déclencheur : poser le PDF, une fois.
    await this.prisma.invoice.updateMany({
      where: { id: invoiceId, pdfKey: null },
      data: { pdfKey: key },
    });
    this.logger.log(`Facture ${invoice.number} : PDF produit (${pdf.length} octets)`);
  }

  /** URL de téléchargement signée et courte (5 min), ou 409 si le PDF est encore en préparation. */
  async downloadUrl(orderId: string): Promise<{ url: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { orderId },
      select: { number: true, pdfKey: true },
    });
    if (!invoice?.pdfKey) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.DOCUMENT_NOT_READY,
        'La facture est en cours de préparation. Merci de réessayer dans un instant.',
      );
    }
    return {
      url: await this.storage.presignDownload(invoice.pdfKey, `facture-${invoice.number}.pdf`),
    };
  }
}
