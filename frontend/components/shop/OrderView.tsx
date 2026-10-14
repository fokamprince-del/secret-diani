'use client';

import { useState } from 'react';
import { userMessage } from '@/lib/api/errors';
import type { Order } from '@/lib/api/types';
import { formatDate, formatPrice } from '@/lib/format';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { FormStatus } from '../ui/States';
import styles from './OrderView.module.css';

const STEP_LABELS: Record<Order['status'], string> = {
  pending_payment: 'Commande créée, en attente de paiement',
  paid: 'Paiement reçu',
  preparing: 'Commande en préparation',
  shipped: 'Commande expédiée',
  delivered: 'Commande livrée',
  cancelled: 'Commande annulée',
  refunded: 'Commande remboursée',
};

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

interface OrderViewProps {
  order: Order;
  /** Récupère l'URL signée de la facture (lien de suivi ou espace membre). */
  getInvoiceUrl: () => Promise<string>;
}

/** Détail d'une commande : articles au prix payé, livraison, étapes, facture. */
export function OrderView({ order, getInvoiceUrl }: OrderViewProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setFailure(null);
    try {
      window.location.assign(await getInvoiceUrl());
    } catch (error) {
      setFailure(userMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.commande}>
      <div className={styles.entete}>
        <p>
          Commande <strong>{order.reference}</strong> du {formatDate(order.createdAt)}
        </p>
        <p className={styles.statut} data-statut={order.status}>
          {order.statusLabel}
        </p>
      </div>

      <section aria-labelledby="articles-commande" className={styles.bloc}>
        <h2 id="articles-commande" className={styles.titre}>
          Articles
        </h2>
        <table className={styles.tableau}>
          <thead>
            <tr>
              <th scope="col">Article</th>
              <th scope="col">Quantité</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={`${item.productName}-${item.variantLabel}`}>
                <th scope="row">
                  {item.productName}
                  <span className={styles.variante}>
                    {item.variantLabel} · {formatPrice(item.unitPriceCents)} l’unité
                  </span>
                </th>
                <td>{item.quantity}</td>
                <td>{formatPrice(item.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Livraison ({order.shippingRateName})
              </th>
              <td>{order.shippingCents === 0 ? 'Offerte' : formatPrice(order.shippingCents)}</td>
            </tr>
            <tr className={styles.total}>
              <th scope="row" colSpan={2}>
                Total payé
              </th>
              <td>{formatPrice(order.totalCents)}</td>
            </tr>
            {order.refundedCents > 0 && (
              <tr>
                <th scope="row" colSpan={2}>
                  Remboursé
                </th>
                <td>{formatPrice(order.refundedCents)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </section>

      <section aria-labelledby="livraison-commande" className={styles.bloc}>
        <h2 id="livraison-commande" className={styles.titre}>
          {order.shippingMethod === 'pickup' ? 'Retrait' : 'Livraison'}
        </h2>
        {order.shippingAddress && (
          <p>
            {order.shippingAddress.firstName} {order.shippingAddress.lastName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 && (
              <>
                <br />
                {order.shippingAddress.line2}
              </>
            )}
            <br />
            {order.shippingAddress.postalCode} {order.shippingAddress.city}
          </p>
        )}
        {order.trackingNumber && (
          <p>
            Suivi {order.carrier ?? 'transporteur'} : <strong>{order.trackingNumber}</strong>
          </p>
        )}
      </section>

      <section aria-labelledby="etapes-commande" className={styles.bloc}>
        <h2 id="etapes-commande" className={styles.titre}>
          Étapes
        </h2>
        <ol className={styles.etapes}>
          {order.timeline.map((event) => (
            <li key={`${event.toStatus}-${event.createdAt}`}>
              <span className={styles.etape}>{STEP_LABELS[event.toStatus]}</span>
              <span className={styles.date}>{dateTime.format(new Date(event.createdAt))}</span>
              {event.note && <span className={styles.note}>{event.note}</span>}
            </li>
          ))}
        </ol>
      </section>

      {order.invoiceAvailable && (
        <div>
          <Button variant="secondaire" onClick={download} loading={busy}>
            <Icon name="download" size={20} />
            Télécharger la facture
          </Button>
          <FormStatus tone="erreur">{failure}</FormStatus>
        </div>
      )}
    </div>
  );
}
