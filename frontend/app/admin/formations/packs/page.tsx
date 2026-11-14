'use client';

import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  DataTable,
  ErrorBox,
  FormActions,
  FormGrid,
  Grid,
  Input,
  Loading,
  Panel,
  Select,
  Textarea,
  Toggle,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { centsToEuros, eurosToCents, formatDateTime } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';
import { formatPrice } from '@/lib/format';

type Pack = components['schemas']['AdminPackDto'];

function PackForm({ pack, onDone }: { pack: Pack; onDone: () => void }) {
  const [name, setName] = useState(pack.name);
  const [price, setPrice] = useState(centsToEuros(pack.priceCents));
  const [summary, setSummary] = useState(pack.summary ?? '');
  const [features, setFeatures] = useState(pack.features.join('\n'));
  const [calls, setCalls] = useState(String(pack.callsIncluded));
  const [visible, setVisible] = useState(pack.visible);
  const save = useAdminMutation(
    async () => {
      const priceCents = eurosToCents(price);
      if (priceCents === null) throw new Error('Prix invalide.');
      return unwrap(
        await adminApi.PATCH('/api/v1/admin/courses/packs/{id}', {
          params: { path: { id: pack.id } },
          body: {
            name: name.trim(),
            priceCents,
            summary: summary.trim() || null,
            features: features
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
            callsIncluded: Number(calls) || 0,
            visible,
          },
        }),
      );
    },
    {
      success: 'Pack enregistré. Les achats passés gardent leur prix.',
      invalidate: [['admin', 'packs']],
    },
  );
  return (
    <>
      <FormGrid>
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Prix (€)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Textarea
          label="Résumé"
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        <Textarea
          label="Ce qui est inclus (une ligne par point)"
          rows={5}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
        />
        <Input
          label="Appels personnalisés inclus"
          inputMode="numeric"
          value={calls}
          onChange={(e) => setCalls(e.target.value.replace(/\D/g, ''))}
        />
        <Toggle label="En vente" checked={visible} onChange={setVisible} />
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
          Enregistrer
        </Btn>
      </FormActions>
    </>
  );
}

export default function PacksPage() {
  const packs = useQuery({
    queryKey: ['admin', 'packs'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/courses/packs')),
  });
  const [editing, setEditing] = useState<Pack | null>(null);
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [userId, setUserId] = useState<string | null>(null);
  const [grantPack, setGrantPack] = useState('');
  const [grantNote, setGrantNote] = useState('');

  const users = useQuery({
    queryKey: ['admin', 'users', 'search', q],
    enabled: q.length >= 3,
    queryFn: async () =>
      unwrap(await adminApi.GET('/api/v1/admin/users', { params: { query: { q, limit: 8 } } })),
  });
  const accesses = useQuery({
    queryKey: ['admin', 'accesses', userId],
    enabled: userId !== null,
    queryFn: async () =>
      unwrap(
        await adminApi.GET('/api/v1/admin/courses/accesses', {
          params: { query: { userId: userId! } },
        }),
      ),
  });
  const grant = useAdminMutation(
    async () =>
      unwrap(
        await adminApi.POST('/api/v1/admin/courses/accesses', {
          body: {
            userId: userId!,
            packId: grantPack || packs.data?.[0]?.id || '',
            source: 'gift',
            note: grantNote.trim() || null,
          },
        }),
      ),
    { success: 'Accès offert : la cliente reçoit un e-mail.', invalidate: [['admin', 'accesses']] },
  );
  const revoke = useAdminMutation(
    async (accessId: string) => {
      const result = await adminApi.POST('/api/v1/admin/courses/accesses/{id}/revoke', {
        params: { path: { id: accessId } },
        body: { note: 'Retiré depuis l’administration' },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Accès retiré.', invalidate: [['admin', 'accesses']] },
  );
  const selected = users.data?.items.find((user) => user.id === userId);

  return (
    <AdminPage
      title="Packs & accès"
      subtitle="Le prix et le contenu des packs, et les accès offerts à la main (cadeau, partenariat)."
    >
      <Panel title="Packs">
        {packs.isPending && <Loading />}
        {packs.isError && <ErrorBox error={packs.error} />}
        {editing && <PackForm key={editing.id} pack={editing} onDone={() => setEditing(null)} />}
        {packs.data && (
          <DataTable
            caption="Packs"
            rows={packs.data}
            rowKey={(row) => row.id}
            columns={[
              {
                header: 'Pack',
                cell: (row) => (
                  <span>
                    {row.name}
                    <br />
                    <small>{row.summary}</small>
                  </span>
                ),
              },
              { header: 'Prix', align: 'end', cell: (row) => formatPrice(row.priceCents) },
              { header: 'Appels', secondary: true, align: 'end', cell: (row) => row.callsIncluded },
              {
                header: 'État',
                cell: (row) =>
                  row.visible ? (
                    <Badge tone="succes">En vente</Badge>
                  ) : (
                    <Badge tone="eteint">Retiré</Badge>
                  ),
              },
              {
                header: '',
                align: 'end',
                cell: (row) => (
                  <Btn variant="fantome" icon="crayon" onClick={() => setEditing(row)}>
                    Modifier
                  </Btn>
                ),
              },
            ]}
          />
        )}
      </Panel>

      <Grid cols={2}>
        <Panel title="Offrir ou retirer un accès">
          <Input
            label="Rechercher une cliente"
            type="search"
            placeholder="Nom ou e-mail (3 lettres min.)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {users.isFetching && <Loading label="Recherche…" />}
          {users.data && (
            <ul role="list" style={{ display: 'grid', gap: '0.3rem' }}>
              {users.data.items.map((user) => (
                <li key={user.id}>
                  <Btn
                    variant={user.id === userId ? 'primaire' : 'fantome'}
                    onClick={() => setUserId(user.id)}
                  >
                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'} ·{' '}
                    {user.email}
                  </Btn>
                </li>
              ))}
              {users.data.items.length === 0 && <li>Aucun compte trouvé.</li>}
            </ul>
          )}
        </Panel>
        {userId && (
          <Panel title={selected ? `Accès de ${selected.firstName ?? selected.email}` : 'Accès'}>
            {accesses.isPending && <Loading />}
            {accesses.data?.length === 0 && <p>Aucun accès pour l’instant.</p>}
            <ul role="list" style={{ display: 'grid', gap: '0.5rem' }}>
              {accesses.data?.map((access) => (
                <li
                  key={access.id}
                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
                >
                  <strong>{access.pack.name}</strong>
                  <small>
                    {access.source === 'purchase' ? 'acheté' : 'offert'} le{' '}
                    {formatDateTime(access.createdAt)}
                  </small>
                  {access.revokedAt ? (
                    <Badge tone="eteint">Retiré</Badge>
                  ) : (
                    <Btn variant="danger" onClick={() => revoke.mutate(access.id)}>
                      Retirer
                    </Btn>
                  )}
                </li>
              ))}
            </ul>
            <FormGrid>
              <Select
                label="Pack à offrir"
                value={grantPack}
                onChange={(e) => setGrantPack(e.target.value)}
                options={(packs.data ?? []).map((pack) => ({ value: pack.id, label: pack.name }))}
              />
              <Input
                label="Note (facultative)"
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
              />
            </FormGrid>
            <FormActions>
              <Btn
                variant="primaire"
                icon="star"
                loading={grant.isPending}
                onClick={() => grant.mutate(undefined)}
              >
                Offrir l’accès
              </Btn>
            </FormActions>
          </Panel>
        )}
      </Grid>
    </AdminPage>
  );
}
