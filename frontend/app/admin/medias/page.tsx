'use client';
/* eslint-disable @next/next/no-img-element -- vignettes déjà optimisées (AVIF/WebP) par le CDN des médias. */

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  ConfirmDialog,
  Empty,
  ErrorBox,
  Input,
  LoadMore,
  Loading,
  Panel,
} from '@/components/admin/kit';
import { type Media, UploadButton, thumbnail } from '@/components/admin/MediaPicker';
import { Icon } from '@/components/ui/Icon';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { MEDIA_STATUS, formatDateTime } from '@/lib/admin/labels';

export default function MediaLibraryPage() {
  const list = useInfiniteQuery({
    queryKey: ['admin', 'media', 'library'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await adminApi.GET('/api/v1/admin/media', {
          params: { query: { limit: 40, cursor: pageParam } },
        }),
      ) as unknown as {
        items: Media[];
        nextCursor: string | null;
      },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const [selected, setSelected] = useState<Media | null>(null);
  const [alt, setAlt] = useState('');
  const [removing, setRemoving] = useState(false);
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  const saveAlt = useAdminMutation(
    async () =>
      unwrap(
        await adminApi.PATCH('/api/v1/admin/media/{id}', {
          params: { path: { id: selected!.id } },
          body: { alt: alt.trim() },
        }),
      ),
    { success: 'Description enregistrée.', invalidate: [['admin', 'media']] },
  );
  const remove = useAdminMutation(
    async () => {
      const result = await adminApi.DELETE('/api/v1/admin/media/{id}', {
        params: { path: { id: selected!.id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Fichier supprimé.', invalidate: [['admin', 'media']] },
  );

  return (
    <AdminPage
      title="Médiathèque"
      subtitle="Vos photos sont nettoyées (GPS retiré), analysées puis déclinées en AVIF et WebP pour un site rapide et net."
      actions={
        <>
          <UploadButton onUploaded={() => list.refetch()} />
          <UploadButton
            label="Envoyer un PDF"
            accept="application/pdf"
            onUploaded={() => list.refetch()}
          />
        </>
      }
    >
      {selected && (
        <Panel
          title="Fichier sélectionné"
          actions={
            <Btn variant="fantome" icon="close" onClick={() => setSelected(null)}>
              Fermer
            </Btn>
          }
        >
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
              alignItems: 'start',
            }}
          >
            {thumbnail(selected) && (
              <img
                src={[...selected.variants].sort((a, b) => b.width - a.width)[0]?.url}
                alt={selected.alt}
                style={{ width: '100%', borderRadius: 12, background: 'var(--studio)' }}
              />
            )}
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <p>
                <strong>{selected.originalName}</strong>
                <br />
                <small>
                  {selected.width && `${selected.width} × ${selected.height} px · `}
                  {formatDateTime(selected.createdAt)}
                </small>
              </p>
              <Input
                label="Description (lue par les lecteurs d’écran et Google)"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Btn
                  variant="primaire"
                  loading={saveAlt.isPending}
                  onClick={() => saveAlt.mutate(undefined)}
                >
                  Enregistrer
                </Btn>
                <Btn variant="danger" icon="corbeille" onClick={() => setRemoving(true)}>
                  Supprimer
                </Btn>
              </div>
            </div>
          </div>
        </Panel>
      )}
      <Panel>
        {list.isPending && <Loading />}
        {list.isError && <ErrorBox error={list.error} />}
        {list.isSuccess && rows.length === 0 && (
          <Empty icon="image">Aucun fichier. Envoyez votre première photo.</Empty>
        )}
        <ul
          role="list"
          style={{
            display: 'grid',
            gap: '0.75rem',
            gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))',
          }}
        >
          {rows.map((media) => {
            const src = thumbnail(media);
            return (
              <li key={media.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(media);
                    setAlt(media.alt);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={{
                    display: 'grid',
                    gap: 6,
                    width: '100%',
                    padding: 0,
                    border: 0,
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  <span
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      aspectRatio: '1',
                      overflow: 'hidden',
                      borderRadius: 12,
                      border: '1px solid var(--filet-fin)',
                      background: 'var(--studio)',
                      color: 'var(--nude)',
                    }}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <Icon name={media.kind === 'document' ? 'document' : 'image'} size={28} />
                    )}
                  </span>
                  <small
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {media.alt || media.originalName}
                  </small>
                  {media.status !== 'ready' && (
                    <Badge tone={MEDIA_STATUS[media.status]?.tone}>
                      {MEDIA_STATUS[media.status]?.label}
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <LoadMore
          hasMore={Boolean(list.hasNextPage)}
          loading={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        />
      </Panel>
      <ConfirmDialog
        open={removing}
        title="Supprimer ce fichier ?"
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setRemoving(false);
              setSelected(null);
            },
          })
        }
      >
        <p>S’il est utilisé sur une page ou un produit, l’image disparaîtra de l’affichage.</p>
      </ConfirmDialog>
    </AdminPage>
  );
}
