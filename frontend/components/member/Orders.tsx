'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { authedApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import { formatDate, formatPrice, pluralize } from '@/lib/format';
import { OrderView } from '../shop/OrderView';
import { Button, ButtonLink } from '../ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import styles from './Forms.module.css';

/** Mes commandes de la boutique, de la plus récente à la plus ancienne. */
export function OrderList() {
  const orders = useQuery({
    queryKey: ['me', 'orders'],
    queryFn: async () =>
      unwrap(await authedApi.GET('/api/v1/me/orders', { params: { query: {} } })),
  });
  if (orders.isError) {
    return (
      <ErrorState
        title="Vos commandes n’ont pas pu être chargées"
        action={<Button onClick={() => orders.refetch()}>Réessayer</Button>}
      >
        <p>{userMessage(orders.error)}</p>
      </ErrorState>
    );
  }
  if (!orders.data) return <Skeleton height="10rem" radius="14px" />;
  if (orders.data.items.length === 0) {
    return (
      <EmptyState
        title="Aucune commande pour le moment"
        icon="bag"
        action={<ButtonLink href="/boutique">Découvrir les kits</ButtonLink>}
      >
        <p>Vos achats dans la boutique apparaîtront ici, avec leur suivi et leurs factures.</p>
      </EmptyState>
    );
  }
  return (
    <ul role="list" className={styles.liste}>
      {orders.data.items.map((order) => (
        <li key={order.id} className={styles.element}>
          <div>
            <p className={styles.elementTitre}>
              <Link href={`/espace-membre/commandes/${order.id}`}>Commande {order.reference}</Link>
              <span className={styles.pastille}>{order.statusLabel}</span>
            </p>
            <p className={styles.elementDetail}>
              {formatDate(order.createdAt)} · {pluralize(order.itemCount, 'article', 'articles')} ·{' '}
              {formatPrice(order.totalCents)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const order = useQuery({
    queryKey: ['me', 'orders', id],
    queryFn: async () =>
      unwrap(await authedApi.GET('/api/v1/me/orders/{id}', { params: { path: { id } } })),
  });
  if (order.isError) {
    return (
      <ErrorState
        title="Cette commande est introuvable"
        action={<ButtonLink href="/espace-membre/commandes">Revenir à mes commandes</ButtonLink>}
      >
        <p>{userMessage(order.error)}</p>
      </ErrorState>
    );
  }
  if (!order.data) return <Skeleton height="16rem" radius="14px" />;
  return (
    <OrderView
      order={order.data}
      getInvoiceUrl={async () =>
        unwrap(await authedApi.GET('/api/v1/me/orders/{id}/invoice', { params: { path: { id } } }))
          .url
      }
    />
  );
}
