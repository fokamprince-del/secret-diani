'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  BtnLink,
  Chips,
  DataTable,
  Empty,
  ErrorBox,
  Grid,
  Loading,
  Panel,
  Stat,
} from '@/components/admin/kit';
import { SalesChart } from '@/components/admin/SalesChart';
import { useAuth } from '@/components/auth/AuthProvider';
import { adminApi, unwrap } from '@/lib/admin/api';
import { CATERING_STATUS, OCCASION, daysUntil, formatDay } from '@/lib/admin/labels';
import { formatPrice } from '@/lib/format';

const PERIODS = [
  { value: '7', label: '7 jours' },
  { value: '30', label: '30 jours' },
  { value: '90', label: '90 jours' },
  { value: '365', label: '1 an' },
] as const;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 18) return 'Bonsoir';
  return 'Bonjour';
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [days, setDays] = useState<(typeof PERIODS)[number]['value']>('30');
  const dashboard = useQuery({
    queryKey: ['admin', 'dashboard', days],
    queryFn: async () =>
      unwrap(await adminApi.GET('/api/v1/admin/dashboard', { params: { query: { days: +days } } })),
  });
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useQuery({
    queryKey: ['admin', 'catering-requests', 'upcoming'],
    queryFn: async () =>
      unwrap(
        await adminApi.GET('/api/v1/admin/catering-requests', {
          params: { query: { from: today, limit: 50 } },
        }),
      ),
  });
  const events = (upcoming.data?.items ?? [])
    .filter((request) => request.status !== 'cancelled' && request.status !== 'delivered')
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .slice(0, 6);

  const data = dashboard.data;

  return (
    <AdminPage
      title={`${greeting()} ${user?.firstName ?? ''}`.trim()}
      subtitle="Ce qui vous attend aujourd’hui, et comment se porte la maison."
      actions={
        <Chips
          label="Période"
          value={days}
          options={PERIODS.map((period) => ({ ...period }))}
          onChange={setDays}
        />
      }
    >
      {dashboard.isPending && <Loading />}
      {dashboard.isError && <ErrorBox error={dashboard.error} retry={() => dashboard.refetch()} />}
      {data && (
        <>
          <Grid cols={4}>
            <Stat
              accent
              icon="couverts"
              label="Demandes traiteur à traiter"
              value={data.todo.cateringPending}
              hint={`${data.todo.cateringUpcoming} événement(s) dans les 14 jours`}
              href="/admin/traiteur/demandes"
            />
            <Stat
              icon="bag"
              label="Commandes à expédier"
              value={data.todo.ordersToShip}
              href="/admin/boutique/commandes"
            />
            <Stat
              icon="chat"
              label="Messages non lus"
              value={data.todo.contactMessagesNew}
              href="/admin/messages"
            />
            <Stat
              icon="accompagnement"
              label="Appels à planifier"
              value={data.todo.callRequestsPending}
              href="/admin/formations/appels"
            />
          </Grid>

          <Grid cols={2}>
            <Panel title="Ventes en ligne">
              <Grid cols={3}>
                <Stat label="Net encaissé" value={formatPrice(data.sales.netCents)} />
                <Stat
                  label="Boutique"
                  value={formatPrice(data.sales.shop.grossCents)}
                  hint={`${data.sales.shop.orders} commande(s)`}
                />
                <Stat
                  label="Formations"
                  value={formatPrice(data.sales.courses.grossCents)}
                  hint={`${data.sales.courses.orders} achat(s)`}
                />
              </Grid>
              <SalesChart days={data.sales.daily} />
            </Panel>

            <Panel
              title="Prochains événements"
              actions={
                <BtnLink href="/admin/traiteur/demandes" variant="fantome">
                  Toutes les demandes
                </BtnLink>
              }
            >
              {upcoming.isPending && <Loading />}
              {upcoming.isError && <ErrorBox error={upcoming.error} />}
              {upcoming.isSuccess && events.length === 0 && (
                <Empty icon="calendrier">Aucun événement à venir pour le moment.</Empty>
              )}
              {events.length > 0 && (
                <DataTable
                  caption="Prochains événements traiteur"
                  rows={events}
                  rowKey={(row) => row.id}
                  rowHref={(row) => `/admin/traiteur/demandes/${row.id}`}
                  columns={[
                    {
                      header: 'Cliente',
                      cell: (row) => `${row.firstName} ${row.lastName ?? ''}`.trim(),
                    },
                    {
                      header: 'Date',
                      cell: (row) => {
                        const left = daysUntil(row.eventDate);
                        return (
                          <span>
                            {formatDay(row.eventDate)}
                            <br />
                            <small>{left === 0 ? 'aujourd’hui' : `dans ${left} j`}</small>
                          </span>
                        );
                      },
                    },
                    {
                      header: 'Occasion',
                      secondary: true,
                      cell: (row) => (row.occasion ? OCCASION[row.occasion] : '—'),
                    },
                    {
                      header: 'État',
                      cell: (row) => (
                        <Badge tone={CATERING_STATUS[row.status]?.tone}>
                          {CATERING_STATUS[row.status]?.label}
                        </Badge>
                      ),
                    },
                  ]}
                />
              )}
            </Panel>
          </Grid>

          <Grid cols={3}>
            <Stat
              icon="utilisateurs"
              label="Nouvelles clientes"
              value={data.customers.newAccounts}
              hint={`${data.customers.totalActive} comptes actifs au total`}
              href="/admin/utilisateurs"
            />
            <Stat
              icon="ecran"
              label="Nouveaux accès formation"
              value={data.courses.newAccesses}
              hint={`${data.courses.activeAccesses} accès actifs`}
              href="/admin/formations/packs"
            />
            <Stat
              icon="mail"
              label="Inscrites à la newsletter"
              value={data.newsletter.confirmed}
              hint={`+${data.newsletter.newConfirmed} sur la période`}
              href="/admin/newsletter"
            />
          </Grid>

          {data.lowStock.length > 0 && (
            <Panel
              title="Stock bas"
              actions={<BtnLink href="/admin/boutique/produits">Gérer le stock</BtnLink>}
            >
              <DataTable
                caption="Articles en stock bas"
                rows={data.lowStock}
                rowKey={(row) => row.variantId}
                columns={[
                  { header: 'Article', cell: (row) => `${row.productName} · ${row.label}` },
                  { header: 'Réf.', secondary: true, cell: (row) => row.sku },
                  {
                    header: 'Disponible',
                    align: 'end',
                    cell: (row) => (
                      <Badge tone={row.available === 0 ? 'alerte' : 'attente'}>
                        {row.available} / seuil {row.threshold}
                      </Badge>
                    ),
                  },
                ]}
              />
            </Panel>
          )}
        </>
      )}
    </AdminPage>
  );
}
