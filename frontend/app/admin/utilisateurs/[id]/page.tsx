'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  ConfirmDialog,
  DataTable,
  ErrorBox,
  Facts,
  FormActions,
  Grid,
  Loading,
  Panel,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { ORDER_STATUS, USER_STATUS, formatDateTime } from '@/lib/admin/labels';
import { formatPrice } from '@/lib/format';

type Action = 'lock' | 'unlock' | 'mfa' | 'sessions';
const ACTIONS: Record<Action, { label: string; confirm: string; danger?: boolean }> = {
  lock: {
    label: 'Bloquer le compte',
    confirm: 'Le compte ne pourra plus se connecter et ses sessions sont fermées.',
    danger: true,
  },
  unlock: { label: 'Débloquer le compte', confirm: 'Le compte pourra de nouveau se connecter.' },
  mfa: {
    label: 'Réinitialiser la double authentification',
    confirm:
      'À utiliser si le téléphone est perdu : elle sera reconfigurée à la prochaine connexion.',
    danger: true,
  },
  sessions: {
    label: 'Déconnecter tous les appareils',
    confirm: 'Toutes les sessions ouvertes sont fermées.',
  },
};

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const key = ['admin', 'user', id];
  const user = useQuery({
    queryKey: key,
    queryFn: async () =>
      unwrap(await adminApi.GET('/api/v1/admin/users/{id}', { params: { path: { id } } })),
  });
  const [action, setAction] = useState<Action | null>(null);
  const run = useAdminMutation(
    async (which: Action) => {
      const params = { params: { path: { id } } };
      if (which === 'lock')
        return unwrap(await adminApi.POST('/api/v1/admin/users/{id}/lock', params));
      if (which === 'unlock')
        return unwrap(await adminApi.POST('/api/v1/admin/users/{id}/unlock', params));
      if (which === 'mfa')
        return unwrap(await adminApi.POST('/api/v1/admin/users/{id}/mfa/reset', params));
      return unwrap(await adminApi.POST('/api/v1/admin/users/{id}/sessions/revoke', params));
    },
    { success: 'C’est fait.', invalidate: [key, ['admin', 'users']] },
  );
  if (user.isPending) return <Loading />;
  if (user.isError) return <ErrorBox error={user.error} />;
  const data = user.data;
  const name = [data.firstName, data.lastName].filter(Boolean).join(' ') || data.email;
  const available: Action[] = [
    data.status === 'locked' ? 'unlock' : 'lock',
    'sessions',
    ...(data.mfaEnabled ? (['mfa'] as Action[]) : []),
  ];
  return (
    <AdminPage
      back={{ href: '/admin/utilisateurs', label: 'Comptes' }}
      title={name}
      subtitle={
        <Badge tone={USER_STATUS[data.status]?.tone}>{USER_STATUS[data.status]?.label}</Badge>
      }
    >
      <Grid cols={2}>
        <Panel title="Profil">
          <Facts
            items={[
              ['E-mail', `${data.email}${data.emailVerified ? '' : ' (non vérifié)'}`],
              ['Téléphone', data.phone],
              ['Rôle', data.role === 'admin' ? 'Administrateur' : 'Cliente'],
              ['Double authentification', data.mfaEnabled ? 'Activée' : 'Non'],
              ['Newsletter', data.marketingConsent ? 'Oui' : 'Non'],
              ['Créé le', formatDateTime(data.createdAt)],
              ['Dernière connexion', formatDateTime(data.lastLoginAt)],
            ]}
          />
        </Panel>
        <Panel title="Activité">
          <Facts
            items={[
              ['Commandes', `${data.stats.paidOrders} payée(s) sur ${data.stats.orders}`],
              ['Accès formation actifs', data.stats.activeAccesses],
              ['Appareils connectés', data.stats.activeSessions],
            ]}
          />
          <FormActions>
            {available.map((which) => (
              <Btn
                key={which}
                variant={ACTIONS[which].danger ? 'danger' : 'secondaire'}
                onClick={() => setAction(which)}
              >
                {ACTIONS[which].label}
              </Btn>
            ))}
          </FormActions>
        </Panel>
      </Grid>
      {data.recentOrders.length > 0 && (
        <Panel title="Dernières commandes">
          <DataTable
            caption="Commandes récentes"
            rows={data.recentOrders}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/boutique/commandes/${row.id}`}
            columns={[
              { header: 'Commande', cell: (row) => `n° ${row.number}` },
              { header: 'Date', cell: (row) => formatDateTime(row.createdAt) },
              { header: 'Total', align: 'end', cell: (row) => formatPrice(row.totalCents) },
              {
                header: 'État',
                cell: (row) => (
                  <Badge tone={ORDER_STATUS[row.status]?.tone}>
                    {ORDER_STATUS[row.status]?.label ?? row.status}
                  </Badge>
                ),
              },
            ]}
          />
        </Panel>
      )}
      <ConfirmDialog
        open={action !== null}
        title={action ? ACTIONS[action].label : ''}
        confirmLabel="Confirmer"
        danger={action ? ACTIONS[action].danger : false}
        loading={run.isPending}
        onClose={() => setAction(null)}
        onConfirm={() => action && run.mutate(action, { onSuccess: () => setAction(null) })}
      >
        <p>{action && ACTIONS[action].confirm}</p>
      </ConfirmDialog>
    </AdminPage>
  );
}
