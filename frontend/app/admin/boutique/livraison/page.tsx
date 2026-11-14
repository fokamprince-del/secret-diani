'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  ConfirmDialog,
  DataTable,
  ErrorBox,
  FormActions,
  FormGrid,
  Input,
  Loading,
  Panel,
  Select,
  Toggle,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { centsToEuros, eurosToCents } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';
import { formatPrice } from '@/lib/format';

type Rate = components['schemas']['ShippingRateDto'];

function RateForm({ rate, onDone }: { rate?: Rate; onDone: () => void }) {
  const [name, setName] = useState(rate?.name ?? '');
  const [method, setMethod] = useState<'delivery' | 'pickup'>(
    rate?.method === 'pickup' ? 'pickup' : 'delivery',
  );
  const [price, setPrice] = useState(centsToEuros(rate?.priceCents ?? 0));
  const [freeFrom, setFreeFrom] = useState(centsToEuros(rate?.freeFromCents));
  const [delay, setDelay] = useState(rate?.delay ?? '');
  const [maxWeight, setMaxWeight] = useState(rate?.maxWeightGrams?.toString() ?? '');
  const [active, setActive] = useState(rate?.active ?? true);
  const save = useAdminMutation(
    async () => {
      const priceCents = eurosToCents(price || '0');
      const freeFromCents = freeFrom.trim() ? eurosToCents(freeFrom) : null;
      if (!name.trim()) throw new Error('Indiquez le nom du tarif.');
      if (priceCents === null || (freeFrom.trim() && freeFromCents === null))
        throw new Error('Montant invalide.');
      const body = {
        name: name.trim(),
        method,
        priceCents,
        freeFromCents,
        delay: delay.trim() || null,
        minWeightGrams: rate?.minWeightGrams ?? 0,
        maxWeightGrams: maxWeight ? Number(maxWeight) : null,
        active,
      };
      return rate
        ? unwrap(
            await adminApi.PATCH('/api/v1/admin/shop/shipping-rates/{id}', {
              params: { path: { id: rate.id } },
              body,
            }),
          )
        : unwrap(await adminApi.POST('/api/v1/admin/shop/shipping-rates', { body }));
    },
    { success: 'Tarif enregistré.', invalidate: [['admin', 'shipping']] },
  );
  return (
    <Panel title={rate ? `Modifier « ${rate.name} »` : 'Nouveau tarif'}>
      <FormGrid>
        <Input
          label="Nom affiché"
          value={name}
          placeholder="Colissimo suivi"
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          label="Mode"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'delivery' | 'pickup')}
          options={[
            { value: 'delivery', label: 'Livraison' },
            { value: 'pickup', label: 'Retrait' },
          ]}
        />
        <Input
          label="Prix (€)"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Input
          label="Offert à partir de (€)"
          inputMode="decimal"
          value={freeFrom}
          placeholder="vide = jamais"
          onChange={(e) => setFreeFrom(e.target.value)}
        />
        <Input
          label="Délai affiché"
          value={delay}
          placeholder="2 à 3 jours ouvrés"
          onChange={(e) => setDelay(e.target.value)}
        />
        <Input
          label="Poids maximal (g)"
          inputMode="numeric"
          value={maxWeight}
          placeholder="vide = sans limite"
          onChange={(e) => setMaxWeight(e.target.value.replace(/\D/g, ''))}
        />
        <Toggle label="Proposé aux clientes" checked={active} onChange={setActive} />
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
    </Panel>
  );
}

export default function ShippingPage() {
  const rates = useQuery({
    queryKey: ['admin', 'shipping'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/shop/shipping-rates')),
  });
  const [editing, setEditing] = useState<Rate | 'new' | null>(null);
  const [removing, setRemoving] = useState<Rate | null>(null);
  const remove = useAdminMutation(
    async () => {
      if (!removing) return;
      const result = await adminApi.DELETE('/api/v1/admin/shop/shipping-rates/{id}', {
        params: { path: { id: removing.id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Tarif supprimé.', invalidate: [['admin', 'shipping']] },
  );
  return (
    <AdminPage
      title="Livraison"
      subtitle="Les tarifs proposés au moment de payer un kit ou un accessoire."
      actions={
        editing === null && (
          <Btn variant="primaire" icon="plus" onClick={() => setEditing('new')}>
            Nouveau tarif
          </Btn>
        )
      }
    >
      {editing !== null && (
        <RateForm
          key={editing === 'new' ? 'new' : editing.id}
          rate={editing === 'new' ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
      <Panel>
        {rates.isPending && <Loading />}
        {rates.isError && <ErrorBox error={rates.error} />}
        {rates.data && (
          <DataTable
            caption="Tarifs de livraison"
            rows={rates.data.filter((rate) => rate.method !== 'digital')}
            rowKey={(row) => row.id}
            columns={[
              {
                header: 'Tarif',
                cell: (row) => (
                  <span>
                    {row.name}
                    <br />
                    <small>{row.delay}</small>
                  </span>
                ),
              },
              {
                header: 'Mode',
                cell: (row) => (row.method === 'pickup' ? 'Retrait' : 'Livraison'),
              },
              {
                header: 'Prix',
                align: 'end',
                cell: (row) => (row.priceCents === 0 ? 'Gratuit' : formatPrice(row.priceCents)),
              },
              {
                header: 'Offert dès',
                secondary: true,
                align: 'end',
                cell: (row) => (row.freeFromCents ? formatPrice(row.freeFromCents) : '—'),
              },
              {
                header: 'État',
                cell: (row) =>
                  row.active ? (
                    <Badge tone="succes">Actif</Badge>
                  ) : (
                    <Badge tone="eteint">Inactif</Badge>
                  ),
              },
              {
                header: '',
                align: 'end',
                cell: (row) => (
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    <Btn
                      variant="fantome"
                      icon="crayon"
                      aria-label={`Modifier ${row.name}`}
                      onClick={() => setEditing(row)}
                    />
                    <Btn
                      variant="fantome"
                      icon="corbeille"
                      aria-label={`Supprimer ${row.name}`}
                      onClick={() => setRemoving(row)}
                    />
                  </span>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <ConfirmDialog
        open={removing !== null}
        title={`Supprimer « ${removing?.name ?? ''} » ?`}
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setRemoving(null) })}
      />
    </AdminPage>
  );
}
