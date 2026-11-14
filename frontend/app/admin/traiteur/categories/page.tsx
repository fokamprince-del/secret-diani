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
  Grid,
  Input,
  Loading,
  Panel,
  Select,
  Textarea,
  Toggle,
} from '@/components/admin/kit';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { CATERING_KIND } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Category = components['schemas']['AdminCateringCategoryDto'];
type Flavour = components['schemas']['AdminFlavourDto'];
type Kind = Category['kind'];

const KIND_OPTIONS = Object.entries(CATERING_KIND).map(([value, label]) => ({ value, label }));

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<Kind>(category?.kind ?? 'platter');
  const [description, setDescription] = useState(category?.description ?? '');
  const [visible, setVisible] = useState(category?.visible ?? true);
  const save = useAdminMutation(
    async () => {
      if (!name.trim()) throw new Error('Indiquez le nom de la catégorie.');
      const body = { name: name.trim(), kind, description: description.trim() || null, visible };
      return category
        ? unwrap(
            await adminApi.PATCH('/api/v1/admin/catering/categories/{id}', {
              params: { path: { id: category.id } },
              body,
            }),
          )
        : unwrap(await adminApi.POST('/api/v1/admin/catering/categories', { body }));
    },
    { success: 'Catégorie enregistrée.', invalidate: [['admin', 'catering']] },
  );
  return (
    <>
      <FormGrid>
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label="Présentation"
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          options={KIND_OPTIONS}
          hint="Plateaux : cartes larges ; layer cakes : galerie et choix des parfums."
        />
        <Textarea
          label="Phrase d’introduction"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Toggle label="Visible sur le site" checked={visible} onChange={setVisible} />
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

export default function CateringCategoriesPage() {
  const categories = useQuery({
    queryKey: ['admin', 'catering', 'categories'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/catering/categories')),
  });
  const flavours = useQuery({
    queryKey: ['admin', 'catering', 'flavours'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/catering/flavours')),
  });
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [newFlavour, setNewFlavour] = useState('');
  const [removing, setRemoving] = useState<
    { type: 'category'; item: Category } | { type: 'flavour'; item: Flavour } | null
  >(null);

  const invalidate = [['admin', 'catering']];
  const addFlavour = useAdminMutation(
    async () => {
      if (!newFlavour.trim()) throw new Error('Indiquez le nom du parfum.');
      return unwrap(
        await adminApi.POST('/api/v1/admin/catering/flavours', {
          body: { name: newFlavour.trim(), visible: true },
        }),
      );
    },
    { success: 'Parfum ajouté.', invalidate },
  );
  const toggleFlavour = useAdminMutation(
    async (flavour: Flavour) =>
      unwrap(
        await adminApi.PATCH('/api/v1/admin/catering/flavours/{id}', {
          params: { path: { id: flavour.id } },
          body: { visible: !flavour.visible },
        }),
      ),
    { success: 'Parfum mis à jour.', invalidate },
  );
  const remove = useAdminMutation(
    async () => {
      if (!removing) return;
      const result =
        removing.type === 'category'
          ? await adminApi.DELETE('/api/v1/admin/catering/categories/{id}', {
              params: { path: { id: removing.item.id } },
            })
          : await adminApi.DELETE('/api/v1/admin/catering/flavours/{id}', {
              params: { path: { id: removing.item.id } },
            });
      if (result.error) unwrap(result);
    },
    { success: 'Supprimé.', invalidate },
  );

  return (
    <AdminPage
      title="Catégories & parfums"
      subtitle="L’organisation de la page Traiteur et les parfums proposés pour les layer cakes."
    >
      <Grid cols={2}>
        <Panel
          title="Catégories"
          actions={
            editing === null && (
              <Btn icon="plus" onClick={() => setEditing('new')}>
                Nouvelle
              </Btn>
            )
          }
        >
          {editing !== null && (
            <CategoryForm
              key={editing === 'new' ? 'new' : editing.id}
              category={editing === 'new' ? undefined : editing}
              onDone={() => setEditing(null)}
            />
          )}
          {categories.isPending && <Loading />}
          {categories.isError && <ErrorBox error={categories.error} />}
          {categories.data && (
            <DataTable
              caption="Catégories du traiteur"
              rows={categories.data}
              rowKey={(row) => row.id}
              columns={[
                {
                  header: 'Catégorie',
                  cell: (row) => (
                    <button
                      type="button"
                      className="sans-filet"
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: 'var(--cacao)',
                      }}
                      onClick={() => setEditing(row)}
                    >
                      {row.name}
                    </button>
                  ),
                },
                { header: 'Type', cell: (row) => CATERING_KIND[row.kind] },
                { header: 'Produits', align: 'end', cell: (row) => row.productCount },
                {
                  header: 'État',
                  cell: (row) =>
                    row.visible ? (
                      <Badge tone="succes">Visible</Badge>
                    ) : (
                      <Badge tone="eteint">Masquée</Badge>
                    ),
                },
                {
                  header: '',
                  align: 'end',
                  cell: (row) => (
                    <Btn
                      variant="fantome"
                      icon="corbeille"
                      aria-label={`Supprimer ${row.name}`}
                      disabled={row.productCount > 0}
                      title={row.productCount > 0 ? 'Videz d’abord la catégorie' : undefined}
                      onClick={() => setRemoving({ type: 'category', item: row })}
                    />
                  ),
                },
              ]}
            />
          )}
        </Panel>

        <Panel title="Parfums">
          <FormGrid>
            <Input
              label="Nouveau parfum"
              value={newFlavour}
              placeholder="ex. Pistache"
              onChange={(e) => setNewFlavour(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                addFlavour.mutate(undefined, { onSuccess: () => setNewFlavour('') })
              }
            />
          </FormGrid>
          <FormActions>
            <Btn
              icon="plus"
              loading={addFlavour.isPending}
              onClick={() => addFlavour.mutate(undefined, { onSuccess: () => setNewFlavour('') })}
            >
              Ajouter
            </Btn>
          </FormActions>
          {flavours.isPending && <Loading />}
          {flavours.data && (
            <DataTable
              caption="Parfums"
              rows={flavours.data}
              rowKey={(row) => row.id}
              columns={[
                { header: 'Parfum', cell: (row) => row.name },
                {
                  header: 'Proposé',
                  cell: (row) => (
                    <Toggle
                      label={row.visible ? 'Oui' : 'Non'}
                      checked={row.visible}
                      onChange={() => toggleFlavour.mutate(row)}
                    />
                  ),
                },
                {
                  header: '',
                  align: 'end',
                  cell: (row) => (
                    <Btn
                      variant="fantome"
                      icon="corbeille"
                      aria-label={`Supprimer ${row.name}`}
                      onClick={() => setRemoving({ type: 'flavour', item: row })}
                    />
                  ),
                },
              ]}
            />
          )}
        </Panel>
      </Grid>

      <ConfirmDialog
        open={removing !== null}
        title={`Supprimer « ${removing?.item.name ?? ''} » ?`}
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setRemoving(null) })}
      />
    </AdminPage>
  );
}
