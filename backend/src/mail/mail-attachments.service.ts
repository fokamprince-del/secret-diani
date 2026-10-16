import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

/** Taille maximale d'une facture jointe (un PDF de facture fait quelques dizaines de ko). */
const MAX_INVOICE_BYTES = 2 * 1024 * 1024;

/** La facture n'est pas encore produite : le worker relance l'envoi un peu plus tard. */
export class AttachmentNotReady extends Error {}

/**
 * Pièces jointes résolues au moment de l'envoi (worker) : la file ne transporte qu'un
 * identifiant, jamais le fichier. La facture PDF est produite juste après le paiement par un
 * autre job ; si elle n'est pas encore là, l'envoi est relancé.
 */
@Injectable()
export class MailAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async invoice(invoiceId: string): Promise<{ filename: string; content: Buffer }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { number: true, pdfKey: true },
    });
    if (!invoice?.pdfKey) throw new AttachmentNotReady(`facture ${invoiceId} en préparation`);
    const content = await this.storage.read('private', invoice.pdfKey, MAX_INVOICE_BYTES);
    return { filename: `facture-${invoice.number}.pdf`, content };
  }
}
