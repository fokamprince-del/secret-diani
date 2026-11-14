'use client';
/* eslint-disable @next/next/no-img-element -- vignettes déjà optimisées (AVIF/WebP) par le CDN des médias. */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { adminApi, unwrap } from '@/lib/admin/api';
import type { components } from '@/lib/api/schema';
import { Icon } from '../ui/Icon';
import { Btn, Empty, ErrorBox, Loading, useNotifyError, useToast } from './kit';
import styles from './MediaPicker.module.css';

export type Media = components['schemas']['MediaDto'];

const ACCEPTED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/pdf',
] as const;
type Accepted = (typeof ACCEPTED)[number];

/** Plus petite variante d'une image, pour les vignettes. */
export function thumbnail(media: Pick<Media, 'variants'> | undefined): string | null {
  const variants = [...(media?.variants ?? [])].sort((a, b) => a.width - b.width);
  return (variants.find((variant) => variant.format === 'webp') ?? variants[0])?.url ?? null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envoi d'un fichier : URL d'envoi signée par l'API, dépôt direct dans le stockage, puis
 * traitement (analyse, variantes AVIF/WebP) suivi jusqu'à ce que le média soit prêt.
 */
export async function uploadMedia(file: File, alt: string): Promise<Media> {
  if (!ACCEPTED.includes(file.type as Accepted)) {
    throw new Error(
      'Format non accepté : JPEG, PNG, WebP, AVIF ou PDF. (Photo iPhone : exportez-la en JPEG.)',
    );
  }
  const presigned = unwrap(
    await adminApi.POST('/api/v1/admin/media/uploads', {
      body: { filename: file.name, contentType: file.type as Accepted, size: file.size, alt },
    }),
  );
  const put = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: presigned.headers as Record<string, string>,
    body: file,
  });
  if (!put.ok) throw new Error('Le dépôt du fichier a échoué. Vérifiez la connexion et réessayez.');
  let media = unwrap(
    await adminApi.POST('/api/v1/admin/media/{id}/complete', {
      params: { path: { id: presigned.media.id } },
    }),
  );
  for (
    let attempt = 0;
    attempt < 40 && (media.status === 'pending' || media.status === 'processing');
    attempt++
  ) {
    await wait(1_500);
    media = unwrap(
      await adminApi.GET('/api/v1/admin/media/{id}', { params: { path: { id: media.id } } }),
    );
  }
  if (media.status === 'rejected') throw new Error(media.rejectionReason ?? 'Fichier refusé.');
  return media;
}

/** Bouton d'envoi d'une photo (ou d'un PDF), utilisable partout dans le back-office. */
export function UploadButton({
  onUploaded,
  label = 'Envoyer une photo',
  accept = 'image/jpeg,image/png,image/webp,image/avif',
}: {
  onUploaded: (media: Media) => void;
  label?: string;
  accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const notifyError = useNotifyError();
  const client = useQueryClient();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const alt = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
            const media = await uploadMedia(file, alt);
            await client.invalidateQueries({ queryKey: ['admin', 'media'] });
            notify('Fichier envoyé et optimisé.');
            onUploaded(media);
          } catch (error) {
            notifyError(error);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Btn icon="plus" loading={busy} onClick={() => input.current?.click()}>
        {busy ? 'Envoi et optimisation…' : label}
      </Btn>
    </>
  );
}

/**
 * Sélecteur d'images : photos choisies (ordre = ordre d'affichage), retrait, ajout depuis la
 * médiathèque ou envoi d'une nouvelle photo.
 */
export function MediaPicker({
  value,
  onChange,
  max = 8,
}: {
  value: { mediaId: string; alt: string; previewUrl: string | null }[];
  onChange: (value: { mediaId: string; alt: string; previewUrl: string | null }[]) => void;
  max?: number;
}) {
  const [browsing, setBrowsing] = useState(false);
  const library = useQuery({
    queryKey: ['admin', 'media', 'images'],
    enabled: browsing,
    queryFn: async () =>
      unwrap(
        await adminApi.GET('/api/v1/admin/media', {
          params: { query: { kind: 'image', status: 'ready', limit: 60 } },
        }),
      ),
  });
  const add = (media: Media) => {
    if (value.some((item) => item.mediaId === media.id) || value.length >= max) return;
    onChange([...value, { mediaId: media.id, alt: media.alt, previewUrl: thumbnail(media) }]);
  };
  const items = (library.data as { items?: Media[] } | undefined)?.items ?? [];

  return (
    <div className={styles.selecteur}>
      {value.length > 0 ? (
        <ul role="list" className={styles.choisies}>
          {value.map((item, index) => (
            <li key={item.mediaId} className={styles.vignette}>
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.alt} />
              ) : (
                <span className={styles.sansApercu}>
                  <Icon name="image" size={22} />
                </span>
              )}
              {index === 0 && <span className={styles.principale}>Principale</span>}
              <div className={styles.outils}>
                {index > 0 && (
                  <button
                    type="button"
                    aria-label={`Mettre en premier : ${item.alt}`}
                    onClick={() => onChange([item, ...value.filter((_, i) => i !== index)])}
                  >
                    ★
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Retirer : ${item.alt}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.aucune}>Aucune photo pour l’instant.</p>
      )}
      <div className={styles.actions}>
        <UploadButton onUploaded={add} />
        <Btn variant="fantome" icon="image" onClick={() => setBrowsing((open) => !open)}>
          {browsing ? 'Fermer la médiathèque' : 'Choisir dans la médiathèque'}
        </Btn>
      </div>
      {browsing && (
        <div className={styles.bibliotheque}>
          {library.isPending && <Loading />}
          {library.isError && <ErrorBox error={library.error} />}
          {library.isSuccess && items.length === 0 && (
            <Empty icon="image">La médiathèque est vide.</Empty>
          )}
          <ul role="list" className={styles.grille}>
            {items.map((media) => {
              const chosen = value.some((item) => item.mediaId === media.id);
              const src = thumbnail(media);
              return (
                <li key={media.id}>
                  <button
                    type="button"
                    className={styles.choix}
                    aria-pressed={chosen}
                    onClick={() => add(media)}
                    disabled={chosen}
                  >
                    {src ? (
                      <img src={src} alt={media.alt} loading="lazy" />
                    ) : (
                      <Icon name="image" size={22} />
                    )}
                    <span className="visually-hidden">
                      {chosen ? 'Déjà choisie : ' : 'Choisir : '}
                      {media.alt}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
