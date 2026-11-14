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
  FormActions,
  FormGrid,
  Input,
  Loading,
  Panel,
  Select,
  Textarea,
  Toggle,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { REVIEW_STATUS, formatDay } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Review = components['schemas']['AdminReviewDto'];
type Status = Review['status'];

function ReviewForm({ onDone }: { onDone: () => void }) {
  const [authorName, setAuthorName] = useState('');
  const [rating, setRating] = useState('5');
  const [content, setContent] = useState('');
  const [occasion, setOccasion] = useState('');
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [sourceNote, setSourceNote] = useState('');
  const [consent, setConsent] = useState(false);
  const save = useAdminMutation(
    async () => {
      if (!consent) throw new Error('Confirmez l’accord de la cliente pour publier son avis.');
      return unwrap(
        await adminApi.POST('/api/v1/admin/reviews', {
          body: {
            authorName: authorName.trim(),
            rating: Number(rating),
            content: content.trim(),
            occasion: occasion.trim() || null,
            receivedOn,
            sourceNote: sourceNote.trim(),
            consentConfirmed: consent,
          },
        }),
      );
    },
    { success: 'Avis ajouté : publiez-le depuis la liste.', invalidate: [['admin', 'reviews']] },
  );
  return (
    <Panel title="Ajouter un avis reçu">
      <FormGrid>
        <Input
          label="Prénom affiché"
          placeholder="ex. Awa D."
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
        />
        <Select
          label="Note"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          options={['5', '4', '3', '2', '1'].map((value) => ({
            value,
            label: '★'.repeat(Number(value)),
          }))}
        />
        <Textarea
          label="Avis (mot pour mot)"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <Input
          label="Occasion"
          placeholder="Anniversaire, mariage…"
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
        />
        <Input
          label="Reçu le"
          type="date"
          value={receivedOn}
          onChange={(e) => setReceivedOn(e.target.value)}
        />
        <Input
          label="Où l’avez-vous reçu ?"
          placeholder="WhatsApp, Instagram, Google…"
          value={sourceNote}
          onChange={(e) => setSourceNote(e.target.value)}
          hint="Gardé pour preuve (obligation légale), jamais affiché."
        />
        <Toggle
          label="La cliente a accepté que son avis soit publié"
          checked={consent}
          onChange={setConsent}
        />
      </FormGrid>
      <FormActions>
        <Btn variant="fantome" onClick={onDone}>
          Fermer
        </Btn>
        <Btn
          variant="primaire"
          loading={save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: onDone })}
        >
          Ajouter
        </Btn>
      </FormActions>
    </Panel>
  );
}

export default function ReviewsPage() {
  const [status, setStatus] = useState<'all' | Status>('all');
  const reviews = useQuery({
    queryKey: ['admin', 'reviews', status],
    queryFn: async () =>
      unwrap(
        await adminApi.GET('/api/v1/admin/reviews', {
          params: { query: { status: status === 'all' ? undefined : status } },
        }),
      ),
  });
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Review | null>(null);
  const moderate = useAdminMutation(
    async ({ review, decision }: { review: Review; decision: 'approved' | 'rejected' }) =>
      unwrap(
        await adminApi.POST('/api/v1/admin/reviews/{id}/moderate', {
          params: { path: { id: review.id } },
          body: { decision },
        }),
      ),
    {
      success: (review) => (review.status === 'approved' ? 'Avis publié.' : 'Avis retiré.'),
      invalidate: [['admin', 'reviews']],
    },
  );
  const remove = useAdminMutation(
    async () => {
      const result = await adminApi.DELETE('/api/v1/admin/reviews/{id}', {
        params: { path: { id: removing!.id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Avis supprimé.', invalidate: [['admin', 'reviews']] },
  );

  return (
    <AdminPage
      title="Avis clientes"
      subtitle="Les avis affichés sur l’accueil et la page Traiteur. Seuls de vrais avis, avec l’accord de la cliente."
      actions={
        !adding && (
          <Btn variant="primaire" icon="plus" onClick={() => setAdding(true)}>
            Ajouter un avis
          </Btn>
        )
      }
    >
      {adding && <ReviewForm onDone={() => setAdding(false)} />}
      <Panel>
        <Chips
          label="Filtrer"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Tous' },
            ...Object.entries(REVIEW_STATUS).map(([value, { label }]) => ({
              value: value as Status,
              label,
            })),
          ]}
        />
        {reviews.isPending && <Loading />}
        {reviews.isError && <ErrorBox error={reviews.error} />}
        {reviews.data?.length === 0 && <Empty icon="heart">Aucun avis.</Empty>}
        <ul
          role="list"
          style={{
            display: 'grid',
            gap: '0.75rem',
            gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))',
          }}
        >
          {reviews.data?.map((review) => (
            <li
              key={review.id}
              style={{
                display: 'grid',
                gap: '0.5rem',
                alignContent: 'start',
                padding: '1rem',
                border: '1px solid var(--filet-fin)',
                borderRadius: 14,
                background: 'var(--creme-clair)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span
                  style={{ color: 'var(--or)', letterSpacing: 2 }}
                  aria-label={`${review.rating} sur 5`}
                >
                  {'★'.repeat(review.rating)}
                </span>
                <Badge tone={REVIEW_STATUS[review.status]?.tone}>
                  {REVIEW_STATUS[review.status]?.label}
                </Badge>
              </div>
              <p style={{ fontStyle: 'italic' }}>« {review.content} »</p>
              <small>
                {review.authorName}
                {review.occasion ? ` · ${review.occasion}` : ''} · {formatDay(review.receivedOn)}
              </small>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {review.status !== 'approved' && (
                  <Btn
                    variant="primaire"
                    onClick={() => moderate.mutate({ review, decision: 'approved' })}
                  >
                    Publier
                  </Btn>
                )}
                {review.status !== 'rejected' && (
                  <Btn
                    variant="fantome"
                    onClick={() => moderate.mutate({ review, decision: 'rejected' })}
                  >
                    Retirer
                  </Btn>
                )}
                <Btn
                  variant="fantome"
                  icon="corbeille"
                  aria-label="Supprimer l’avis"
                  onClick={() => setRemoving(review)}
                />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <ConfirmDialog
        open={removing !== null}
        title="Supprimer cet avis ?"
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setRemoving(null) })}
      />
    </AdminPage>
  );
}
