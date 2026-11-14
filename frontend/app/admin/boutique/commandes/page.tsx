'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  Chips,
  DataTable,
  Empty,
  ErrorBox,
  Input,
  LoadMore,
  Loading,
  Panel,
  Toolbar,
  useNotifyError,
} from '@/components/admin/kit';
import { adminApi, unwrap } from '@/lib/admin/api';
import { ORDER_STATUS, formatDateTime } from '@/lib/admin/labels';
import { formatPrice } from '@/lib/format';

type Status =
  'pending_payment' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

const FILTERS: { value: 'all' | Status; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'paid', label: 'À préparer' },
  { value: 'preparing', label: 'En préparation' },
  { value: 'shipped', label: 'Expédiées' },
  { value: 'delivered', label: 'Livrées' },
  { value: 'refunded', label: 'Remboursées' },
  { value: 'cancelled', label: 'Annulées' },
];

export default function OrdersPage() {
  const [status, setStatus] = useState<'all' | Status>('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const notifyError = useNotifyError();
  const q = useDeferredValue(search.trim());
  const list = useInfiniteQuery({
    queryKey: ['admin', 'orders', status, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await adminApi.GET('/api/v1/admin/shop/orders', {
          params: {
            query: {
              limit: 30,
              cursor: pageParam,
              status: status === 'all' ? undefined : status,
              q: q || undefined,
            },
          },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { response } = await adminApi.GET('/api/v1/admin/shop/orders/export', {
        params: { query: { status: status === 'all' ? undefined : status } },
        parseAs: 'blob',
      });
      if (!response.ok) throw new Error('Export impossible pour le moment.');
      const url = URL.createObjectURL(await response.clone().blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `commandes-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notifyError(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminPage
      title="Commandes"
      subtitle="Kits et accessoires vendus en ligne. Les achats de formations y figurent aussi."
      actions={
        <Btn icon="download" loading={exporting} onClick={exportCsv}>
          Exporter (CSV)
        </Btn>
      }
    >
      <Panel>
        <Toolbar>
          <Chips label="Filtrer par état" value={status} options={FILTERS} onChange={setStatus} />
          <div style={{ minWidth: 'min(100%, 18rem)' }}>
            <Input
              label="Rechercher"
              type="search"
              placeholder="Nom, e-mail ou n° de commande"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Toolbar>
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} retry={() => list.refetch()} />}
        {list.isSuccess && rows.length === 0 && (
          <Empty icon="bag">Aucune commande pour ce filtre.</Empty>
        )}
        {rows.length > 0 && (
          <DataTable
            caption="Commandes"
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/boutique/commandes/${row.id}`}
            columns={[
              {
                header: 'Commande',
                cell: (row) => (
                  <span>
                    {row.reference}
                    <br />
                    <small>{row.customerName}</small>
                  </span>
                ),
              },
              { header: 'Date', secondary: true, cell: (row) => formatDateTime(row.createdAt) },
              { header: 'Articles', secondary: true, align: 'end', cell: (row) => row.itemCount },
              { header: 'Total', align: 'end', cell: (row) => formatPrice(row.totalCents) },
              {
                header: 'État',
                cell: (row) => (
                  <Badge tone={ORDER_STATUS[row.status]?.tone}>{row.statusLabel}</Badge>
                ),
              },
            ]}
          />
        )}
        <LoadMore
          hasMore={Boolean(list.hasNextPage)}
          loading={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        />
      </Panel>
    </AdminPage>
  );
}
