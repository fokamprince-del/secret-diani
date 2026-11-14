'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  DataTable,
  Empty,
  ErrorBox,
  FormActions,
  FormGrid,
  Input,
  Loading,
  Panel,
  Select,
  Textarea,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { useRouter } from 'next/navigation';

export default function CoursesPage() {
  const router = useRouter();
  const courses = useQuery({
    queryKey: ['admin', 'courses'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/courses')),
  });
  const stats = useQuery({
    queryKey: ['admin', 'courses', 'stats'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/courses/stats')),
  });
  const packs = useQuery({
    queryKey: ['admin', 'packs'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/courses/packs')),
  });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [packId, setPackId] = useState('');

  const create = useAdminMutation(
    async () => {
      if (!title.trim() || !summary.trim()) throw new Error('Indiquez le titre et le résumé.');
      return unwrap(
        await adminApi.POST('/api/v1/admin/courses', {
          body: {
            title: title.trim(),
            summary: summary.trim(),
            packId: packId || packs.data?.[0]?.id || '',
            featured: false,
          },
        }),
      );
    },
    { success: 'Formation créée (brouillon).', invalidate: [['admin', 'courses']] },
  );

  return (
    <AdminPage
      title="Formations"
      subtitle="Vos formations en ligne : modules, leçons, vidéos. Un brouillon n’est visible que de vous."
      actions={
        !creating && (
          <Btn variant="primaire" icon="plus" onClick={() => setCreating(true)}>
            Nouvelle formation
          </Btn>
        )
      }
    >
      {creating && (
        <Panel title="Nouvelle formation">
          <FormGrid>
            <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Select
              label="Pack"
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              options={(packs.data ?? []).map((pack) => ({ value: pack.id, label: pack.name }))}
            />
            <Textarea
              label="Résumé"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </FormGrid>
          <FormActions>
            <Btn variant="fantome" onClick={() => setCreating(false)}>
              Annuler
            </Btn>
            <Btn
              variant="primaire"
              loading={create.isPending}
              onClick={() =>
                create.mutate(undefined, {
                  onSuccess: (course) => router.push(`/admin/formations/${course.id}`),
                })
              }
            >
              Créer
            </Btn>
          </FormActions>
        </Panel>
      )}
      <Panel>
        {courses.isPending && <Loading />}
        {courses.isError && <ErrorBox error={courses.error} retry={() => courses.refetch()} />}
        {courses.data?.length === 0 && <Empty icon="ecran">Aucune formation.</Empty>}
        {courses.data && courses.data.length > 0 && (
          <DataTable
            caption="Formations"
            rows={courses.data}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/formations/${row.id}`}
            columns={[
              { header: 'Formation', cell: (row) => row.title },
              { header: 'Pack', cell: (row) => row.pack.name },
              { header: 'Leçons', align: 'end', cell: (row) => row._count.lessons },
              {
                header: 'Élèves',
                secondary: true,
                align: 'end',
                cell: (row) => {
                  const stat = stats.data?.find((item) => item.courseId === row.id);
                  return stat
                    ? `${stat.enrolled} · ${Math.round(stat.completionRate)} % finissent`
                    : '—';
                },
              },
              {
                header: 'État',
                cell: (row) =>
                  row.status === 'published' ? (
                    <Badge tone="succes">En ligne</Badge>
                  ) : (
                    <Badge tone="eteint">Brouillon</Badge>
                  ),
              },
            ]}
          />
        )}
      </Panel>
    </AdminPage>
  );
}
