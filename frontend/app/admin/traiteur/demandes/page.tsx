'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import {
  AdminPage,
  Badge,
  Chips,
  DataTable,
  Empty,
  ErrorBox,
  Input,
  LoadMore,
  Loading,
  Panel,
  Toolbar,
} from '@/components/admin/kit';
import { adminApi, unwrap } from '@/lib/admin/api';
import {
  CATERING_STATUS,
  OCCASION,
  daysUntil,
  formatDateTime,
  formatDay,
} from '@/lib/admin/labels';
import { formatPrice } from '@/lib/format';

type Status = 'new' | 'contacted' | 'deposit_received' | 'confirmed' | 'delivered' | 'cancelled';

const FILTERS: { value: 'all' | Status; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'new', label: 'Nouvelles' },
  { value: 'contacted', label: 'Contactées' },
  { value: 'deposit_received', label: 'Acompte reçu' },
  { value: 'confirmed', label: 'Confirmées' },
  { value: 'delivered', label: 'Livrées' },
  { value: 'cancelled', label: 'Annulées' },
];

export default function CateringRequestsPage() {
  const [status, setStatus] = useState<'all' | Status>('all');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());

  const list = useInfiniteQuery({
    queryKey: ['admin', 'catering-requests', status, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await adminApi.GET('/api/v1/admin/catering-requests', {
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

  return (
    <AdminPage
      title="Demandes & devis"
      subtitle="Chaque demande du formulaire traiteur arrive ici : rappelez la cliente, fixez le total, enregistrez l’acompte."
    >
      <Panel>
        <Toolbar>
          <Chips label="Filtrer par état" value={status} options={FILTERS} onChange={setStatus} />
          <div style={{ minWidth: 'min(100%, 18rem)' }}>
            <Input
              label="Rechercher"
              type="search"
              placeholder="Nom, e-mail ou référence (TR-…)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </Toolbar>
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} retry={() => list.refetch()} />}
        {list.isSuccess && rows.length === 0 && (
          <Empty icon="couverts">Aucune demande pour ce filtre.</Empty>
        )}
        {rows.length > 0 && (
          <DataTable
            caption="Demandes traiteur"
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/traiteur/demandes/${row.id}`}
            columns={[
              {
                header: 'Cliente',
                cell: (row) => (
                  <span>
                    {row.firstName} {row.lastName}
                    <br />
                    <small>{row.reference}</small>
                  </span>
                ),
              },
              {
                header: 'Événement',
                cell: (row) => {
                  const left = daysUntil(row.eventDate);
                  return (
                    <span>
                      {formatDay(row.eventDate)}
                      <br />
                      <small>
                        {row.occasion ? OCCASION[row.occasion] : 'Occasion non précisée'}
                        {left >= 0 && left <= 14 ? ` · J-${left}` : ''}
                      </small>
                    </span>
                  );
                },
              },
              {
                header: 'Invités',
                secondary: true,
                align: 'end',
                cell: (row) => row.guestCount ?? '—',
              },
              {
                header: 'Montant',
                align: 'end',
                cell: (row) =>
                  row.agreedTotalCents !== null
                    ? formatPrice(row.agreedTotalCents)
                    : row.estimatedTotalCents !== null
                      ? `≈ ${formatPrice(row.estimatedTotalCents)}`
                      : '—',
              },
              {
                header: 'État',
                cell: (row) => (
                  <Badge tone={CATERING_STATUS[row.status]?.tone}>
                    {CATERING_STATUS[row.status]?.label}
                  </Badge>
                ),
              },
              {
                header: 'Reçue',
                secondary: true,
                cell: (row) => formatDateTime(row.createdAt),
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
