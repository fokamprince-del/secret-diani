'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  DataTable,
  ErrorBox,
  FormActions,
  FormGrid,
  Input,
  Loading,
  Panel,
  Textarea,
  Toggle,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { formatDateTime } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Page = components['schemas']['AdminPageDto'];

function PageEditor({ page, onDone }: { page: Page; onDone: () => void }) {
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.bodyMarkdown);
  const [published, setPublished] = useState(page.published);
  const [seoTitle, setSeoTitle] = useState(page.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(page.seoDescription ?? '');
  useEffect(() => window.scrollTo({ top: 0, behavior: 'smooth' }), []);
  const save = useAdminMutation(
    async () =>
      unwrap(
        await adminApi.PUT('/api/v1/admin/pages/{slug}', {
          params: { path: { slug: page.slug } },
          body: {
            title: title.trim(),
            bodyMarkdown: body,
            published,
            seoTitle: seoTitle.trim() || null,
            seoDescription: seoDescription.trim() || null,
          },
        }),
      ),
    { success: 'Page enregistrée.', invalidate: [['admin', 'pages']] },
  );
  return (
    <Panel title={`Modifier « ${page.title} »`}>
      <FormGrid>
        <Input wide label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          label="Texte"
          rows={20}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          hint="## Intertitre · **gras** · *italique* · - liste · [lien](https://…) · une ligne vide entre deux paragraphes."
          style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.9rem' }}
        />
        <Input
          label="Titre pour Google"
          maxLength={70}
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
        />
        <Input
          label="Description pour Google"
          maxLength={160}
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
        />
        <Toggle
          label="Publiée"
          checked={published}
          onChange={setPublished}
          hint="Une page non publiée affiche le texte par défaut du site."
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
          Enregistrer
        </Btn>
      </FormActions>
    </Panel>
  );
}

export default function PagesPage() {
  const pages = useQuery({
    queryKey: ['admin', 'pages'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/pages')),
  });
  const [editing, setEditing] = useState<Page | null>(null);
  return (
    <AdminPage
      title="Pages"
      subtitle="À propos, mentions légales, CGV, confidentialité : vos textes, sans développeur."
    >
      {editing && <PageEditor key={editing.slug} page={editing} onDone={() => setEditing(null)} />}
      <Panel>
        {pages.isPending && <Loading />}
        {pages.isError && <ErrorBox error={pages.error} />}
        {pages.data && (
          <DataTable
            caption="Pages"
            rows={pages.data}
            rowKey={(row) => row.slug}
            columns={[
              {
                header: 'Page',
                cell: (row) => (
                  <span>
                    {row.title}
                    <br />
                    <small>/{row.slug}</small>
                  </span>
                ),
              },
              { header: 'Modifiée', secondary: true, cell: (row) => formatDateTime(row.updatedAt) },
              {
                header: 'État',
                cell: (row) =>
                  row.published ? (
                    <Badge tone="succes">Publiée</Badge>
                  ) : (
                    <Badge tone="attente">À relire</Badge>
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
    </AdminPage>
  );
}
