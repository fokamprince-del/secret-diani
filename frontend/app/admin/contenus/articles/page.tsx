'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  BtnLink,
  Chips,
  DataTable,
  Empty,
  ErrorBox,
  LoadMore,
  Loading,
  Panel,
} from '@/components/admin/kit';
import { adminApi, unwrap } from '@/lib/admin/api';
import { formatDateTime } from '@/lib/admin/labels';

type State = 'draft' | 'scheduled' | 'published';
const STATE: Record<State, { label: string; tone: 'eteint' | 'attente' | 'succes' }> = {
  draft: { label: 'Brouillon', tone: 'eteint' },
  scheduled: { label: 'Programmé', tone: 'attente' },
  published: { label: 'Publié', tone: 'succes' },
};

export default function ArticlesPage() {
  const [state, setState] = useState<'all' | State>('all');
  const list = useInfiniteQuery({
    queryKey: ['admin', 'articles', state],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await adminApi.GET('/api/v1/admin/articles', {
          params: {
            query: { limit: 30, cursor: pageParam, state: state === 'all' ? undefined : state },
          },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <AdminPage
      title="Conseils & astuces"
      subtitle="Vos articles : recettes, astuces, organisation. Un bon article par mois aide Google à vous trouver."
      actions={
        <BtnLink href="/admin/contenus/articles/nouveau" variant="primaire" icon="plus">
          Nouvel article
        </BtnLink>
      }
    >
      <Panel>
        <Chips
          label="Filtrer"
          value={state}
          onChange={setState}
          options={[
            { value: 'all', label: 'Tous' },
            ...Object.entries(STATE).map(([value, { label }]) => ({
              value: value as State,
              label,
            })),
          ]}
        />
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} />}
        {list.isSuccess && rows.length === 0 && <Empty icon="livre">Aucun article.</Empty>}
        {rows.length > 0 && (
          <DataTable
            caption="Articles"
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/contenus/articles/${row.id}`}
            columns={[
              { header: 'Article', cell: (row) => row.title },
              {
                header: 'Lecture',
                secondary: true,
                align: 'end',
                cell: (row) => `${row.readingMinutes} min`,
              },
              {
                header: 'Publication',
                secondary: true,
                cell: (row) => formatDateTime(row.publishedAt),
              },
              {
                header: 'État',
                cell: (row) => <Badge tone={STATE[row.state].tone}>{STATE[row.state].label}</Badge>,
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
