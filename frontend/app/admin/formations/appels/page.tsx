'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  Chips,
  ConfirmDialog,
  Empty,
  ErrorBox,
  Input,
  Loading,
  Panel,
  Select,
  Textarea,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { CALL_STATUS, formatDateTime } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Call = components['schemas']['AdminCallRequestDto'];
type Status = Call['status'];

export default function CallsPage() {
  const [status, setStatus] = useState<'all' | Status>('requested');
  const calls = useQuery({
    queryKey: ['admin', 'calls', status],
    queryFn: async () =>
      unwrap(
        await adminApi.GET('/api/v1/admin/courses/call-requests', {
          params: { query: { status: status === 'all' ? undefined : status } },
        }),
      ),
  });
  const [editing, setEditing] = useState<Call | null>(null);
  const [nextStatus, setNextStatus] = useState<Status>('scheduled');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const save = useAdminMutation(
    async () =>
      unwrap(
        await adminApi.PATCH('/api/v1/admin/courses/call-requests/{id}', {
          params: { path: { id: editing!.id } },
          body: {
            status: nextStatus,
            scheduledAt: when ? new Date(when).toISOString() : null,
            adminNote: note.trim() || null,
          },
        }),
      ),
    {
      success: 'Appel mis à jour.',
      invalidate: [
        ['admin', 'calls'],
        ['admin', 'dashboard'],
      ],
    },
  );

  return (
    <AdminPage
      title="Appels personnalisés"
      subtitle="Les élèves des packs supérieurs peuvent demander un appel avec vous."
    >
      <Panel>
        <Chips
          label="Filtrer"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Tous' },
            ...Object.entries(CALL_STATUS).map(([value, { label }]) => ({
              value: value as Status,
              label,
            })),
          ]}
        />
        {calls.isPending && <Loading />}
        {calls.isError && <ErrorBox error={calls.error} />}
        {calls.data?.length === 0 && <Empty icon="accompagnement">Rien à planifier.</Empty>}
        <ul role="list" style={{ display: 'grid', gap: '0.75rem' }}>
          {calls.data?.map((call) => (
            <li
              key={call.id}
              style={{
                display: 'grid',
                gap: '0.4rem',
                padding: '1rem',
                border: '1px solid var(--filet-fin)',
                borderRadius: 12,
              }}
            >
              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}
              >
                <strong>
                  {[call.user.firstName, call.user.lastName].filter(Boolean).join(' ') ||
                    call.user.email}
                </strong>
                <Badge tone={CALL_STATUS[call.status]?.tone}>
                  {CALL_STATUS[call.status]?.label}
                </Badge>
                <small>demandé le {formatDateTime(call.createdAt)}</small>
                {call.scheduledAt && <small>· prévu le {formatDateTime(call.scheduledAt)}</small>}
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{call.message}</p>
              {call.adminNote && (
                <p>
                  <small>Note : {call.adminNote}</small>
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Btn icon="mail" onClick={() => window.open(`mailto:${call.user.email}`)}>
                  Écrire
                </Btn>
                <Btn
                  icon="calendrier"
                  onClick={() => {
                    setEditing(call);
                    setNextStatus(call.status === 'requested' ? 'scheduled' : call.status);
                    setWhen(call.scheduledAt?.slice(0, 16) ?? '');
                    setNote(call.adminNote ?? '');
                  }}
                >
                  Planifier / mettre à jour
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <ConfirmDialog
        open={editing !== null}
        title="Mettre à jour l’appel"
        confirmLabel="Enregistrer"
        loading={save.isPending}
        onClose={() => setEditing(null)}
        onConfirm={() => save.mutate(undefined, { onSuccess: () => setEditing(null) })}
      >
        <Select
          label="État"
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as Status)}
          options={Object.entries(CALL_STATUS).map(([value, { label }]) => ({ value, label }))}
        />
        <Input
          label="Date et heure"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <Textarea
          label="Note interne"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </ConfirmDialog>
    </AdminPage>
  );
}
