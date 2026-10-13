import { BullModule, Processor, WorkerHost } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CertificatesService } from '../courses/certificates/certificates.service';
import { WatermarkService } from '../courses/resources/watermark.service';
import { InvoicesService } from '../shop/invoices/invoices.service';
import { DOCUMENTS_QUEUE, type DocumentJobData } from '../shop/shop.constants';

/** Documents PDF produits hors requête (relances automatiques de BullMQ en cas d'échec). */
@Processor(DOCUMENTS_QUEUE)
export class DocumentsProcessor extends WorkerHost {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly certificates: CertificatesService,
    private readonly watermark: WatermarkService,
  ) {
    super();
  }

  async process(job: Job<DocumentJobData>): Promise<void> {
    const data = job.data;
    if (job.name === 'invoice-pdf' && 'invoiceId' in data)
      await this.invoices.renderPdf(data.invoiceId);
    if (job.name === 'certificate-pdf' && 'certificateId' in data) {
      await this.certificates.renderPdf(data.certificateId);
    }
    if (job.name === 'watermark-pdf' && 'resourceId' in data) {
      await this.watermark.render(data.resourceId, data.userId);
    }
  }
}

/** Factures, certificats et fiches filigranées (worker). */
@Module({
  imports: [BullModule.registerQueue({ name: DOCUMENTS_QUEUE })],
  providers: [InvoicesService, CertificatesService, WatermarkService, DocumentsProcessor],
})
export class DocumentsWorkerModule {}
