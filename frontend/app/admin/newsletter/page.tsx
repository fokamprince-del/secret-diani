'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  Chips,
  ConfirmDialog,
  DataTable,
  Empty,
  ErrorBox,
  LoadMore,
  Loading,
  Panel,
  useNotifyError,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { SUBSCRIBER_STATUS, formatDateTime } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Subscriber = components['schemas']['SubscriberDto'];
type Status = Subscriber['status'];

export default function NewsletterPage() {
  const [status, setStatus] = useState<'all' | Status>('confirmed');
  const [exporting, setExporting] = useState(false);
  const [removing, setRemoving] = useState<Subscriber | null>(null);
  const notifyError = useNotifyError();
  const list = useInfiniteQuery({
    queryKey: ['admin', 'newsletter', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await adminApi.GET('/api/v1/admin/newsletter/subscribers', {
          params: {
            query: { limit: 50, cursor: pageParam, status: status === 'all' ? undefined : status },
          },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  const remove = useAdminMutation(
    async () => {
      const result = await adminApi.DELETE('/api/v1/admin/newsletter/subscribers/{id}', {
        params: { path: { id: removing!.id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Adresse supprimée.', invalidate: [['admin', 'newsletter']] },
  );
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { response } = await adminApi.GET('/api/v1/admin/newsletter/subscribers/export', {
        parseAs: 'blob',
      });
      if (!response.ok) throw new Error('Export impossible pour le moment.');
      const url = URL.createObjectURL(await response.clone().blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
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
      title="Newsletter"
      subtitle="Les inscrites ont confirmé leur adresse (double validation). Exportez la liste pour votre outil d’envoi (Brevo, Mailchimp…)."
      actions={
        <Btn icon="download" loading={exporting} onClick={exportCsv}>
          Exporter les inscrites (CSV)
        </Btn>
      }
    >
      <Panel>
        <Chips
          label="Filtrer"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Toutes' },
            ...Object.entries(SUBSCRIBER_STATUS).map(([value, { label }]) => ({
              value: value as Status,
              label,
            })),
          ]}
        />
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} />}
        {list.isSuccess && rows.length === 0 && <Empty icon="mail">Personne pour ce filtre.</Empty>}
        {rows.length > 0 && (
          <DataTable
            caption="Abonnées"
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Adresse', cell: (row) => row.email },
              {
                header: 'Origine',
                secondary: true,
                cell: (row) => (row.source === 'account' ? 'Création de compte' : 'Formulaire'),
              },
              {
                header: 'Depuis',
                secondary: true,
                cell: (row) => formatDateTime(row.confirmedAt ?? row.requestedAt),
              },
              {
                header: 'État',
                cell: (row) => (
                  <Badge tone={SUBSCRIBER_STATUS[row.status]?.tone}>
                    {SUBSCRIBER_STATUS[row.status]?.label}
                  </Badge>
                ),
              },
              {
                header: '',
                align: 'end',
                cell: (row) => (
                  <Btn
                    variant="fantome"
                    icon="corbeille"
                    aria-label={`Supprimer ${row.email}`}
                    onClick={() => setRemoving(row)}
                  />
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
      <ConfirmDialog
        open={removing !== null}
        title="Supprimer cette adresse ?"
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setRemoving(null) })}
      >
        <p>{removing?.email} — à utiliser pour une demande d’effacement (RGPD).</p>
      </ConfirmDialog>
    </AdminPage>
  );
}
