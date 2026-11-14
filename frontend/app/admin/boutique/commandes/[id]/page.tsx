'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  ConfirmDialog,
  DataTable,
  ErrorBox,
  Facts,
  FormActions,
  Grid,
  Input,
  Loading,
  Panel,
  Textarea,
  Toggle,
  useNotifyError,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { ORDER_STATUS, eurosToCents, formatDateTime } from '@/lib/admin/labels';
import { formatPrice } from '@/lib/format';

type Next = 'preparing' | 'shipped' | 'delivered' | 'cancelled';
const NEXT_LABEL: Record<Next, string> = {
  preparing: 'Passer en préparation',
  shipped: 'Marquer expédiée',
  delivered: 'Marquer livrée',
  cancelled: 'Annuler la commande',
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const key = ['admin', 'order', id];
  const notifyError = useNotifyError();
  const order = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await adminApi.GET('/api/v1/admin/shop/orders/{id}', { params: { path: { id } } })),
  });
  const payments = useQuery({
    queryKey: [...key, 'payments'],
    queryFn: async () =>
      unwrap(
        await adminApi.GET('/api/v1/admin/shop/orders/{id}/payments', { params: { path: { id } } }),
      ),
  });
  const [next, setNext] = useState<Next | null>(null);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [note, setNote] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [restock, setRestock] = useState(true);
  const invalidate = [key, ['admin', 'orders'], ['admin', 'dashboard']];

  const change = useAdminMutation(
    async (status: Next) =>
      unwrap(
        await adminApi.POST('/api/v1/admin/shop/orders/{id}/status', {
          params: { path: { id } },
          body: {
            status,
            carrier: carrier.trim() || null,
            trackingNumber: tracking.trim() || null,
            note: note.trim() || null,
          },
        }),
      ),
    {
      success: (output) =>
        `Commande : ${output.statusLabel.toLowerCase()}. La cliente est prévenue par e-mail.`,
      invalidate,
    },
  );
  const refund = useAdminMutation(
    async () => {
      const cents = refundAmount.trim() ? eurosToCents(refundAmount) : undefined;
      if (cents === null) throw new Error('Montant invalide.');
      if (!refundReason.trim()) throw new Error('Indiquez le motif du remboursement.');
      return unwrap(
        await adminApi.POST('/api/v1/admin/shop/orders/{id}/refunds', {
          params: { path: { id } },
          body: { reason: refundReason.trim(), restock, ...(cents ? { amountCents: cents } : {}) },
        }),
      );
    },
    { success: 'Remboursement lancé.', invalidate: [...invalidate, [...key, 'payments']] },
  );

  const invoice = async () => {
    try {
      const { url } = unwrap(
        await adminApi.GET('/api/v1/admin/shop/orders/{id}/invoice', { params: { path: { id } } }),
      );
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      notifyError(error);
    }
  };

  if (order.isPending) return <Loading />;
  if (order.isError) return <ErrorBox error={order.error} retry={() => order.refetch()} />;
  const data = order.data;
  const address = data.shippingAddress as {
    firstName?: string;
    lastName?: string;
    line1?: string;
    line2?: string | null;
    postalCode?: string;
    city?: string;
    country?: string;
  } | null;
  const refundable = ['paid', 'preparing', 'shipped', 'delivered'].includes(data.status);

  return (
    <AdminPage
      back={{ href: '/admin/boutique/commandes', label: 'Commandes' }}
      title={`Commande ${data.reference}`}
      subtitle={
        <>
          {formatDateTime(data.createdAt)} ·{' '}
          <Badge tone={ORDER_STATUS[data.status]?.tone}>{data.statusLabel}</Badge>
        </>
      }
      actions={
        <>
          {data.invoiceAvailable && (
            <Btn icon="download" onClick={invoice}>
              Facture
            </Btn>
          )}
          {refundable && (
            <Btn variant="danger" onClick={() => setRefunding(true)}>
              Rembourser
            </Btn>
          )}
        </>
      }
    >
      <Grid cols={2}>
        <Panel title="Cliente">
          <Facts
            items={[
              ['Nom', data.customerName],
              [
                'E-mail',
                <a key="m" href={`mailto:${data.email}`}>
                  {data.email}
                </a>,
              ],
              ['Téléphone', data.phone],
              ['Compte', data.userId ? 'Oui' : 'Achat sans compte'],
              ['Mode', data.shippingRateName],
              [
                'Adresse de livraison',
                address
                  ? `${address.firstName ?? ''} ${address.lastName ?? ''}, ${address.line1 ?? ''}${address.line2 ? `, ${address.line2}` : ''}, ${address.postalCode ?? ''} ${address.city ?? ''}`
                  : '—',
              ],
            ]}
          />
          {data.customerNote && (
            <p>
              <strong>Note de la cliente :</strong> {data.customerNote}
            </p>
          )}
        </Panel>
        <Panel title="Montants">
          <Facts
            items={[
              ['Sous-total', formatPrice(data.subtotalCents)],
              ['Livraison', formatPrice(data.shippingCents)],
              ['Total', <strong key="t">{formatPrice(data.totalCents)}</strong>],
              ['Remboursé', data.refundedCents ? formatPrice(data.refundedCents) : '—'],
              ['Payée le', formatDateTime(data.paidAt)],
              ['Facture', data.invoiceNumber],
              ['Transporteur', data.carrier],
              ['Suivi', data.trackingNumber],
            ]}
          />
        </Panel>
      </Grid>

      <Panel title="Articles">
        <DataTable
          caption="Articles de la commande"
          rows={data.items}
          rowKey={(row) => `${row.sku}-${row.variantLabel}-${row.productName}`}
          columns={[
            { header: 'Article', cell: (row) => `${row.productName} · ${row.variantLabel}` },
            { header: 'Réf.', secondary: true, cell: (row) => row.sku ?? '—' },
            { header: 'Qté', align: 'end', cell: (row) => row.quantity },
            { header: 'Total', align: 'end', cell: (row) => formatPrice(row.lineTotalCents) },
          ]}
        />
      </Panel>

      {data.nextStatuses.length > 0 && (
        <Panel title="Faire avancer la commande">
          <FormActions>
            {data.nextStatuses.map((status) => (
              <Btn
                key={status}
                variant={
                  status === 'cancelled'
                    ? 'danger'
                    : status === 'shipped'
                      ? 'primaire'
                      : 'secondaire'
                }
                onClick={() => setNext(status)}
              >
                {NEXT_LABEL[status]}
              </Btn>
            ))}
          </FormActions>
        </Panel>
      )}

      <Grid cols={2}>
        <Panel title="Historique">
          <ol role="list" style={{ display: 'grid', gap: '0.5rem' }}>
            {data.timeline.map((event, index) => (
              <li
                key={index}
                style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}
              >
                <Badge tone={ORDER_STATUS[event.toStatus]?.tone}>
                  {ORDER_STATUS[event.toStatus]?.label}
                </Badge>
                <small>{formatDateTime(event.createdAt)}</small>
                {event.note && <span>— {event.note}</span>}
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Paiements">
          {payments.data?.map((payment) => (
            <Facts
              key={payment.id}
              items={[
                ['Moyen', payment.provider === 'stripe' ? 'Carte (Stripe)' : 'PayPal'],
                ['État', payment.status],
                ['Montant', formatPrice(payment.amountCents)],
                ['Remboursé', payment.refundedCents ? formatPrice(payment.refundedCents) : '—'],
              ]}
            />
          ))}
          {payments.data?.length === 0 && <p>Aucun paiement enregistré.</p>}
        </Panel>
      </Grid>

      <ConfirmDialog
        open={next !== null}
        title={next ? NEXT_LABEL[next] : ''}
        confirmLabel="Confirmer"
        danger={next === 'cancelled'}
        loading={change.isPending}
        onClose={() => setNext(null)}
        onConfirm={() => next && change.mutate(next, { onSuccess: () => setNext(null) })}
      >
        {next === 'shipped' && (
          <>
            <Input
              label="Transporteur"
              placeholder="ex. Colissimo"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
            <Input
              label="Numéro de suivi"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
            />
          </>
        )}
        <Textarea
          label="Note (facultative)"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={refunding}
        title="Rembourser la commande"
        confirmLabel="Rembourser"
        danger
        loading={refund.isPending}
        onClose={() => setRefunding(false)}
        onConfirm={() => refund.mutate(undefined, { onSuccess: () => setRefunding(false) })}
      >
        <Input
          label="Montant (€)"
          inputMode="decimal"
          placeholder={`vide = tout (${formatPrice(data.totalCents - data.refundedCents)})`}
          value={refundAmount}
          onChange={(e) => setRefundAmount(e.target.value)}
        />
        <Textarea
          label="Motif"
          rows={2}
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
        />
        <Toggle label="Remettre les articles en stock" checked={restock} onChange={setRestock} />
      </ConfirmDialog>
    </AdminPage>
  );
}
