/** File des documents produits par le worker : factures, certificats, fiches filigranées. */
export const DOCUMENTS_QUEUE = 'documents';

/** Données d'une tâche, selon son nom (invoice-pdf, certificate-pdf, watermark-pdf). */
export type DocumentJobData =
  { invoiceId: string } | { certificateId: string } | { resourceId: string; userId: string };

/** File des tâches périodiques de la boutique (expiration des paiements non aboutis). */
export const SHOP_MAINTENANCE_QUEUE = 'shop-maintenance';
export const EXPIRE_ORDERS_JOB = 'expire-orders';
