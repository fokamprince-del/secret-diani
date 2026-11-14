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
import { USER_STATUS, formatDateTime } from '@/lib/admin/labels';

export default function UsersPage() {
  const [role, setRole] = useState<'all' | 'client' | 'admin'>('all');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const list = useInfiniteQuery({
    queryKey: ['admin', 'users', role, q],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await adminApi.GET('/api/v1/admin/users', {
          params: {
            query: {
              limit: 30,
              cursor: pageParam,
              role: role === 'all' ? undefined : role,
              q: q || undefined,
            },
          },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <AdminPage title="Comptes" subtitle="Les comptes clientes et administrateurs.">
      <Panel>
        <Toolbar>
          <Chips
            label="Rôle"
            value={role}
            onChange={setRole}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'client', label: 'Clientes' },
              { value: 'admin', label: 'Administrateurs' },
            ]}
          />
          <div style={{ minWidth: 'min(100%, 18rem)' }}>
            <Input
              label="Rechercher"
              type="search"
              placeholder="Nom ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Toolbar>
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} />}
        {list.isSuccess && rows.length === 0 && <Empty icon="utilisateurs">Aucun compte.</Empty>}
        {rows.length > 0 && (
          <DataTable
            caption="Comptes"
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/utilisateurs/${row.id}`}
            columns={[
              {
                header: 'Compte',
                cell: (row) => (
                  <span>
                    {[row.firstName, row.lastName].filter(Boolean).join(' ') || '—'}
                    <br />
                    <small>{row.email}</small>
                  </span>
                ),
              },
              {
                header: 'Rôle',
                cell: (row) =>
                  row.role === 'admin' ? <Badge tone="info">Admin</Badge> : 'Cliente',
              },
              { header: 'Créé', secondary: true, cell: (row) => formatDateTime(row.createdAt) },
              {
                header: 'Dernière connexion',
                secondary: true,
                cell: (row) => formatDateTime(row.lastLoginAt),
              },
              {
                header: 'État',
                cell: (row) => (
                  <Badge tone={USER_STATUS[row.status]?.tone}>
                    {USER_STATUS[row.status]?.label}
                  </Badge>
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
