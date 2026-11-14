'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  Chips,
  Empty,
  ErrorBox,
  LoadMore,
  Loading,
  Panel,
  Textarea,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { CONTACT_STATUS, CONTACT_SUBJECT, formatDateTime } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Message = components['schemas']['ContactMessageDto'];
type Status = Message['status'];

function MessageCard({ message }: { message: Message }) {
  const [open, setOpen] = useState(message.status === 'new');
  const [note, setNote] = useState(message.adminNote ?? '');
  const update = useAdminMutation(
    async (patch: { status?: Status; adminNote?: string | null }) =>
      unwrap(
        await adminApi.PATCH('/api/v1/admin/contact-messages/{id}', {
          params: { path: { id: message.id } },
          body: patch,
        }),
      ),
    {
      success: 'Message mis à jour.',
      invalidate: [
        ['admin', 'messages'],
        ['admin', 'dashboard'],
      ],
    },
  );
  const reply = `mailto:${message.email}?subject=${encodeURIComponent(`Re : ${CONTACT_SUBJECT[message.subject]} — Les Secrets de Diani`)}`;
  return (
    <li
      style={{
        display: 'grid',
        gap: '0.5rem',
        padding: '1rem',
        border: '1px solid var(--filet-fin)',
        borderRadius: 14,
        background: message.status === 'new' ? 'var(--creme-clair)' : 'var(--blanc)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <strong style={{ color: 'var(--cacao)' }}>{message.name}</strong>
        <Badge>{CONTACT_SUBJECT[message.subject]}</Badge>
        <Badge tone={CONTACT_STATUS[message.status]?.tone}>
          {CONTACT_STATUS[message.status]?.label}
        </Badge>
        <small style={{ marginLeft: 'auto' }}>{formatDateTime(message.createdAt)}</small>
      </button>
      {open && (
        <>
          <p style={{ whiteSpace: 'pre-wrap' }}>{message.message}</p>
          <small>
            {message.email}
            {message.phone ? ` · ${message.phone}` : ''}
          </small>
          <Textarea
            label="Note interne"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <Btn
              variant="primaire"
              icon="mail"
              onClick={() => {
                update.mutate({ status: 'answered', adminNote: note.trim() || null });
                window.location.href = reply;
              }}
            >
              Répondre par e-mail
            </Btn>
            {message.status === 'new' && (
              <Btn
                onClick={() => update.mutate({ status: 'read', adminNote: note.trim() || null })}
              >
                Marquer lu
              </Btn>
            )}
            {message.status !== 'archived' && (
              <Btn
                variant="fantome"
                onClick={() =>
                  update.mutate({ status: 'archived', adminNote: note.trim() || null })
                }
              >
                Archiver
              </Btn>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export default function MessagesPage() {
  const [status, setStatus] = useState<'all' | Status>('new');
  const list = useInfiniteQuery({
    queryKey: ['admin', 'messages', status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await adminApi.GET('/api/v1/admin/contact-messages', {
          params: {
            query: { limit: 30, cursor: pageParam, status: status === 'all' ? undefined : status },
          },
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <AdminPage title="Messages" subtitle="Les messages envoyés depuis la page Contact.">
      <Panel>
        <Chips
          label="Filtrer"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Tous' },
            ...Object.entries(CONTACT_STATUS).map(([value, { label }]) => ({
              value: value as Status,
              label,
            })),
          ]}
        />
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} />}
        {list.isSuccess && rows.length === 0 && <Empty icon="chat">Aucun message ici.</Empty>}
        <ul role="list" style={{ display: 'grid', gap: '0.6rem' }}>
          {rows.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
        </ul>
        <LoadMore
          hasMore={Boolean(list.hasNextPage)}
          loading={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        />
      </Panel>
    </AdminPage>
  );
}
