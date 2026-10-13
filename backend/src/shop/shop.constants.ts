/** File des documents produits par le worker (factures PDF ; certificats en phase 7). */
export const DOCUMENTS_QUEUE = 'documents';

export interface DocumentJobData {
  invoiceId: string;
}

/** File des tâches périodiques de la boutique (expiration des paiements non aboutis). */
export const SHOP_MAINTENANCE_QUEUE = 'shop-maintenance';
export const EXPIRE_ORDERS_JOB = 'expire-orders';
