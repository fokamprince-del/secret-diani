'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import {
  AdminPage,
  DataTable,
  Empty,
  ErrorBox,
  LoadMore,
  Loading,
  Panel,
} from '@/components/admin/kit';
import { adminApi, unwrap } from '@/lib/admin/api';
import { formatDateTime } from '@/lib/admin/labels';

/** Traduction lisible des actions les plus fréquentes du journal. */
function actionLabel(action: string): string {
  const known: Record<string, string> = {
    'auth.login': 'Connexion',
    'auth.login_failed': 'Échec de connexion',
    'auth.logout': 'Déconnexion',
    'auth.password_reset': 'Mot de passe réinitialisé',
    'auth.password_changed': 'Mot de passe changé',
    'user.registered': 'Inscription',
  };
  return known[action] ?? action.replace(/[._]/g, ' ');
}

export default function AuditPage() {
  const list = useInfiniteQuery({
    queryKey: ['admin', 'audit'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await adminApi.GET('/api/v1/admin/audit-logs', {
          params: { query: { limit: 50, cursor: pageParam } },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <AdminPage
      title="Journal d’audit"
      subtitle="Qui a fait quoi, et quand. Inaltérable : même un administrateur ne peut pas l’effacer."
    >
      <Panel>
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} />}
        {list.isSuccess && rows.length === 0 && <Empty icon="journal">Journal vide.</Empty>}
        {rows.length > 0 && (
          <DataTable
            caption="Journal d’audit"
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Action', cell: (row) => actionLabel(row.action) },
              {
                header: 'Cible',
                secondary: true,
                cell: (row) =>
                  row.targetType
                    ? `${row.targetType}${row.targetId ? ` · ${row.targetId.slice(0, 8)}` : ''}`
                    : '—',
              },
              {
                header: 'Par',
                secondary: true,
                cell: (row) => (row.actorId ? row.actorId.slice(0, 8) : 'Système'),
              },
              { header: 'IP', secondary: true, cell: (row) => row.ipTruncated ?? '—' },
              { header: 'Quand', cell: (row) => formatDateTime(row.createdAt) },
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
