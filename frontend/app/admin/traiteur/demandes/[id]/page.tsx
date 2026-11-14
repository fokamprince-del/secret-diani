'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  BtnLink,
  ConfirmDialog,
  ErrorBox,
  Facts,
  FormActions,
  FormGrid,
  Grid,
  Input,
  Loading,
  Panel,
  Select,
  Textarea,
  useToast,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import {
  CATERING_STATUS,
  FULFILMENT,
  OCCASION,
  SOURCE,
  centsToEuros,
  daysUntil,
  eurosToCents,
  formatDateTime,
  formatDay,
} from '@/lib/admin/labels';
import { formatPrice } from '@/lib/format';

type Action = 'contacted' | 'confirmed' | 'delivered' | 'cancelled';

const ACTION_LABEL: Record<Action, string> = {
  contacted: 'Marquer « contactée »',
  confirmed: 'Confirmer la commande',
  delivered: 'Marquer « livrée »',
  cancelled: 'Annuler la demande',
};

const DEPOSIT_METHODS = [
  { value: 'Virement', label: 'Virement' },
  { value: 'Espèces', label: 'Espèces' },
  { value: 'PayPal', label: 'PayPal' },
  { value: 'Carte', label: 'Carte bancaire' },
  { value: 'Autre', label: 'Autre' },
];

export default function CateringRequestPage() {
  const { id } = useParams<{ id: string }>();
  const notify = useToast();
  const key = ['admin', 'catering-request', id];
  const request = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(
        await adminApi.GET('/api/v1/admin/catering-requests/{id}', {
          params: { path: { id } },
        }),
      ),
  });
  const invalidate = [key, ['admin', 'catering-requests'], ['admin', 'dashboard']];

  const [notes, setNotes] = useState('');
  const [agreed, setAgreed] = useState('');
  const [occasion, setOccasion] = useState('');
  const [statusAction, setStatusAction] = useState<Action | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositMethod, setDepositMethod] = useState('Virement');

  const data = request.data;
  useEffect(() => {
    if (!data) return;
    // Formulaire rempli une fois à partir des données chargées (puis édité localement).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(data.internalNotes ?? '');
    setAgreed(centsToEuros(data.agreedTotalCents));
    setOccasion(data.occasion ?? '');
  }, [data]);

  const save = useAdminMutation(
    async () => {
      const cents = agreed.trim() === '' ? null : eurosToCents(agreed);
      if (agreed.trim() !== '' && cents === null)
        throw new Error('Montant invalide (ex. 180 ou 180,50).');
      return unwrap(
        await adminApi.PATCH('/api/v1/admin/catering-requests/{id}', {
          params: { path: { id } },
          body: {
            internalNotes: notes.trim() || null,
            ...(data?.depositReceivedAt ? {} : { agreedTotalCents: cents }),
            occasion: (occasion || null) as never,
          },
        }),
      );
    },
    { success: 'Demande enregistrée.', invalidate },
  );

  const changeStatus = useAdminMutation(
    async (status: Action) =>
      unwrap(
        await adminApi.POST('/api/v1/admin/catering-requests/{id}/status', {
          params: { path: { id } },
          body: { status, note: statusNote.trim() || null },
        }),
      ),
    {
      success: (output) => `Demande : ${CATERING_STATUS[output.status]?.label.toLowerCase()}.`,
      invalidate,
    },
  );

  const deposit = useAdminMutation(
    async () => {
      const cents = eurosToCents(agreed);
      return unwrap(
        await adminApi.POST('/api/v1/admin/catering-requests/{id}/deposit', {
          params: { path: { id } },
          body: { method: depositMethod, ...(cents !== null ? { agreedTotalCents: cents } : {}) },
        }),
      );
    },
    { success: 'Acompte enregistré : la date est réservée.', invalidate },
  );

  const copyRecap = async () => {
    try {
      const recap = unwrap(
        await adminApi.GET('/api/v1/admin/catering-requests/{id}/recap', {
          params: { path: { id } },
        }),
      );
      await navigator.clipboard.writeText(recap.text);
      notify('Récapitulatif copié : collez-le dans WhatsApp ou un e-mail.');
    } catch {
      notify('Copie impossible. Réessayez.', 'alerte');
    }
  };

  if (request.isPending) return <Loading />;
  if (request.isError) return <ErrorBox error={request.error} retry={() => request.refetch()} />;
  if (!data) return null;

  const left = daysUntil(data.eventDate);
  const status = CATERING_STATUS[data.status];
  const actions = data.nextStatuses.filter((next): next is Action => next in ACTION_LABEL);
  const canDeposit = data.nextStatuses.includes('deposit_received');
  const finished = data.status === 'delivered' || data.status === 'cancelled';

  return (
    <AdminPage
      back={{ href: '/admin/traiteur/demandes', label: 'Demandes' }}
      title={`${data.firstName} ${data.lastName ?? ''}`.trim()}
      subtitle={
        <>
          {data.reference} · {SOURCE[data.source]} · reçue le {formatDateTime(data.createdAt)}{' '}
          <Badge tone={status?.tone}>{status?.label}</Badge>
        </>
      }
      actions={
        <>
          {data.customerWhatsappUrl && (
            <BtnLink href={data.customerWhatsappUrl} external icon="whatsapp" variant="primaire">
              WhatsApp
            </BtnLink>
          )}
          <BtnLink
            href={`mailto:${data.email}?subject=${encodeURIComponent(`Votre demande ${data.reference}`)}`}
            icon="mail"
            external
          >
            E-mail
          </BtnLink>
          <Btn icon="copier" onClick={copyRecap}>
            Copier le récapitulatif
          </Btn>
        </>
      }
    >
      <Grid cols={2}>
        <Panel title="L’événement">
          <Facts
            items={[
              [
                'Date',
                <>
                  {formatDay(data.eventDate)}
                  {left >= 0 && !finished && <small> · dans {left} jour(s)</small>}
                </>,
              ],
              ['Occasion', data.occasion ? OCCASION[data.occasion] : 'Non précisée'],
              ['Invités', data.guestCount ?? 'Non précisé'],
              [
                'Retrait / livraison',
                data.fulfilment
                  ? `${FULFILMENT[data.fulfilment]}${data.deliveryAddress ? ` : ${data.deliveryAddress}` : ''}`
                  : 'Non précisé',
              ],
              [
                'E-mail',
                <a key="mail" href={`mailto:${data.email}`}>
                  {data.email}
                </a>,
              ],
              [
                'Téléphone',
                data.phone ? (
                  <a key="tel" href={`tel:${data.phone}`}>
                    {data.phone}
                  </a>
                ) : (
                  '—'
                ),
              ],
            ]}
          />
          {data.message && (
            <blockquote
              style={{
                margin: 0,
                padding: '0.9rem 1rem',
                borderLeft: '3px solid var(--nude)',
                background: 'var(--creme-clair)',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
              }}
            >
              {data.message}
            </blockquote>
          )}
        </Panel>

        <Panel title="Sélection & montants">
          {data.items.length === 0 ? (
            <p>Pas de sélection : tout est dans le message.</p>
          ) : (
            <ul role="list" style={{ display: 'grid', gap: '0.5rem' }}>
              {data.items.map((item, index) => (
                <li
                  key={index}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}
                >
                  <span>
                    {item.quantity} × {item.productName} <small>({item.variantLabel})</small>
                    {item.flavours.length > 0 && (
                      <>
                        <br />
                        <small>Parfums : {item.flavours.join(', ')}</small>
                      </>
                    )}
                  </span>
                  <strong>{formatPrice(item.unitPriceCents * item.quantity)}</strong>
                </li>
              ))}
            </ul>
          )}
          <Facts
            items={[
              [
                'Estimation du site',
                data.estimatedTotalCents !== null ? formatPrice(data.estimatedTotalCents) : '—',
              ],
              [
                'Total convenu',
                data.agreedTotalCents !== null ? formatPrice(data.agreedTotalCents) : 'À fixer',
              ],
              [
                'Acompte',
                data.depositReceivedAt
                  ? `${formatPrice(data.depositCents ?? 0)} reçu le ${formatDateTime(data.depositReceivedAt)} (${data.depositMethod})`
                  : data.depositCents !== null
                    ? `${formatPrice(data.depositCents)} attendu`
                    : '—',
              ],
              ['Solde à régler', data.balanceCents !== null ? formatPrice(data.balanceCents) : '—'],
            ]}
          />
        </Panel>
      </Grid>

      {!finished && (
        <Panel title="Suivi">
          <FormGrid>
            <Input
              label="Total convenu (€)"
              inputMode="decimal"
              placeholder="ex. 180"
              value={agreed}
              disabled={Boolean(data.depositReceivedAt)}
              hint={
                data.depositReceivedAt
                  ? 'Figé depuis la réception de l’acompte.'
                  : 'Base du calcul de l’acompte.'
              }
              onChange={(event) => setAgreed(event.target.value)}
            />
            <Select
              label="Occasion"
              value={occasion}
              onChange={(event) => setOccasion(event.target.value)}
              options={[
                { value: '', label: 'Non précisée' },
                ...Object.entries(OCCASION).map(([value, label]) => ({ value, label })),
              ]}
            />
            <Textarea
              label="Notes internes"
              hint="Jamais visibles de la cliente."
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </FormGrid>
          <FormActions>
            {canDeposit && (
              <Btn variant="secondaire" icon="check" onClick={() => setDepositOpen(true)}>
                Acompte reçu
              </Btn>
            )}
            {actions.map((action) => (
              <Btn
                key={action}
                variant={action === 'cancelled' ? 'danger' : 'secondaire'}
                onClick={() => {
                  setStatusNote('');
                  setStatusAction(action);
                }}
              >
                {ACTION_LABEL[action]}
              </Btn>
            ))}
            <Btn variant="primaire" loading={save.isPending} onClick={() => save.mutate(undefined)}>
              Enregistrer
            </Btn>
          </FormActions>
        </Panel>
      )}

      {finished && data.internalNotes && (
        <Panel title="Notes internes">
          <p style={{ whiteSpace: 'pre-wrap' }}>{data.internalNotes}</p>
        </Panel>
      )}

      <Panel title="Historique">
        <ol role="list" style={{ display: 'grid', gap: '0.6rem' }}>
          {data.events.map((event, index) => (
            <li
              key={index}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}
            >
              <Badge tone={CATERING_STATUS[event.toStatus]?.tone}>
                {CATERING_STATUS[event.toStatus]?.label}
              </Badge>
              <small>{formatDateTime(event.createdAt)}</small>
              {event.note && <span>— {event.note}</span>}
            </li>
          ))}
        </ol>
      </Panel>

      <ConfirmDialog
        open={statusAction !== null}
        title={statusAction ? ACTION_LABEL[statusAction] : ''}
        confirmLabel="Confirmer"
        danger={statusAction === 'cancelled'}
        loading={changeStatus.isPending}
        onClose={() => setStatusAction(null)}
        onConfirm={() =>
          statusAction &&
          changeStatus.mutate(statusAction, { onSuccess: () => setStatusAction(null) })
        }
      >
        {statusAction === 'cancelled' && (
          <p>L’acompte éventuellement versé n’est pas remboursable (conditions de commande).</p>
        )}
        <Textarea
          label={statusAction === 'cancelled' ? 'Motif (obligatoire)' : 'Note (facultative)'}
          rows={3}
          value={statusNote}
          onChange={(event) => setStatusNote(event.target.value)}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={depositOpen}
        title="Enregistrer l’acompte"
        confirmLabel="Acompte reçu"
        loading={deposit.isPending}
        onClose={() => setDepositOpen(false)}
        onConfirm={() => deposit.mutate(undefined, { onSuccess: () => setDepositOpen(false) })}
      >
        <p>
          Le montant de l’acompte est calculé sur le total convenu
          {agreed ? ` (${agreed} €)` : ''}. La date de la cliente est alors réservée.
        </p>
        <Select
          label="Reçu par"
          value={depositMethod}
          onChange={(event) => setDepositMethod(event.target.value)}
          options={DEPOSIT_METHODS}
        />
      </ConfirmDialog>
    </AdminPage>
  );
}
