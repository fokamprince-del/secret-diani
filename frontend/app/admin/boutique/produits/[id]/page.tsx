'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AdminPage,
  Btn,
  ConfirmDialog,
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
import { MediaPicker } from '@/components/admin/MediaPicker';
import styles from '@/components/admin/catalogue.module.css';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import { centsToEuros, eurosToCents } from '@/lib/admin/labels';

interface VariantRow {
  id?: string;
  sku: string;
  label: string;
  price: string;
  weight: string;
  active: boolean;
}
interface KitRow {
  label: string;
  quantity: string;
  details: string;
}

const emptyVariant = (): VariantRow => ({
  sku: '',
  label: 'Standard',
  price: '',
  weight: '',
  active: true,
});

export default function ShopProductPage() {
  const { id } = useParams<{ id: string }>();
  const creating = id === 'nouveau';
  const router = useRouter();
  const product = useQuery({
    queryKey: ['admin', 'shop', 'product', id],
    enabled: !creating,
    queryFn: async () =>
      unwrap(await adminApi.GET('/api/v1/admin/shop/products/{id}', { params: { path: { id } } })),
  });

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'kit' | 'accessory'>('kit');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [visible, setVisible] = useState(true);
  const [variants, setVariants] = useState<VariantRow[]>([emptyVariant()]);
  const [composition, setComposition] = useState<KitRow[]>([]);
  const [images, setImages] = useState<
    { mediaId: string; alt: string; previewUrl: string | null }[]
  >([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const data = product.data;
    if (!data) return;
    // Formulaire rempli une fois à partir des données chargées (puis édité localement).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(data.name);
    setKind(data.kind);
    setShortDescription(data.shortDescription ?? '');
    setDescription(data.descriptionMarkdown);
    setVisible(data.visible);
    setVariants(
      data.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        label: v.label,
        price: centsToEuros(v.priceCents),
        weight: String(v.weightGrams),
        active: v.active,
      })),
    );
    setComposition(
      data.composition.map((item) => ({
        label: item.label,
        quantity: String(item.quantity),
        details: item.details ?? '',
      })),
    );
    setImages(data.images);
  }, [product.data]);

  const body = () => {
    if (!name.trim()) throw new Error('Indiquez le nom du produit.');
    return {
      name: name.trim(),
      kind,
      shortDescription: shortDescription.trim() || null,
      descriptionMarkdown: description,
      visible,
      variants: variants.map((variant) => {
        const priceCents = eurosToCents(variant.price);
        if (priceCents === null) throw new Error(`Prix invalide pour « ${variant.label} ».`);
        if (!variant.sku.trim()) throw new Error('Chaque variante a besoin d’une référence (SKU).');
        return {
          ...(variant.id ? { id: variant.id } : {}),
          sku: variant.sku.trim(),
          label: variant.label.trim() || 'Standard',
          priceCents,
          weightGrams: Number(variant.weight) || 0,
          active: variant.active,
        };
      }),
      composition: composition
        .filter((item) => item.label.trim())
        .map((item) => ({
          label: item.label.trim(),
          quantity: Number(item.quantity) || 1,
          details: item.details.trim() || null,
        })),
      images: images.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
    };
  };
  const invalidate = [['admin', 'shop']];
  const save = useAdminMutation(
    async () =>
      creating
        ? unwrap(await adminApi.POST('/api/v1/admin/shop/products', { body: body() }))
        : unwrap(
            await adminApi.PATCH('/api/v1/admin/shop/products/{id}', {
              params: { path: { id } },
              body: body(),
            }),
          ),
    { success: 'Produit enregistré.', invalidate },
  );
  const remove = useAdminMutation(
    async () => {
      const result = await adminApi.DELETE('/api/v1/admin/shop/products/{id}', {
        params: { path: { id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Produit supprimé.', invalidate },
  );

  if (!creating && product.isPending) return <Loading />;
  if (product.isError) return <ErrorBox error={product.error} />;
  const setVariant = (index: number, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const setKit = (index: number, patch: Partial<KitRow>) =>
    setComposition((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const submit = () =>
    save.mutate(undefined, {
      onSuccess: (saved) => creating && router.replace(`/admin/boutique/produits/${saved.id}`),
    });

  return (
    <AdminPage
      back={{ href: '/admin/boutique/produits', label: 'Produits & stock' }}
      title={creating ? 'Nouveau produit' : name}
      actions={
        <Btn variant="primaire" icon="check" loading={save.isPending} onClick={submit}>
          Enregistrer
        </Btn>
      }
    >
      <Panel title="L’essentiel">
        <FormGrid>
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
          <Select
            label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'kit' | 'accessory')}
            options={[
              { value: 'kit', label: 'Kit' },
              { value: 'accessory', label: 'Accessoire' },
            ]}
          />
          <Input
            wide
            label="Accroche"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
          />
          <Textarea
            label="Description"
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            hint="Mise en forme simple : **gras**, listes avec « - », paragraphes séparés par une ligne vide."
          />
          <Toggle label="Visible sur le site" checked={visible} onChange={setVisible} />
        </FormGrid>
      </Panel>

      <Panel title="Variantes & prix">
        <div className={styles.lignes}>
          {variants.map((variant, index) => (
            <div
              key={index}
              className={styles.ligne}
              data-cols="4"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))' }}
            >
              <Input
                label="Libellé"
                value={variant.label}
                onChange={(e) => setVariant(index, { label: e.target.value })}
              />
              <Input
                label="Référence (SKU)"
                value={variant.sku}
                onChange={(e) => setVariant(index, { sku: e.target.value.toUpperCase() })}
              />
              <Input
                label="Prix (€)"
                inputMode="decimal"
                value={variant.price}
                onChange={(e) => setVariant(index, { price: e.target.value })}
              />
              <Input
                label="Poids (g)"
                inputMode="numeric"
                value={variant.weight}
                hint="Calcul des frais de port"
                onChange={(e) => setVariant(index, { weight: e.target.value.replace(/\D/g, '') })}
              />
              <Toggle
                label="En vente"
                checked={variant.active}
                onChange={(active) => setVariant(index, { active })}
              />
            </div>
          ))}
        </div>
        <FormActions>
          <Btn icon="plus" onClick={() => setVariants((rows) => [...rows, emptyVariant()])}>
            Ajouter une variante
          </Btn>
        </FormActions>
      </Panel>

      {kind === 'kit' && (
        <Panel title="Contenu du kit">
          <div className={styles.lignes}>
            {composition.map((item, index) => (
              <div key={index} className={styles.ligne} data-cols="4">
                <Input
                  label="Élément"
                  value={item.label}
                  onChange={(e) => setKit(index, { label: e.target.value })}
                />
                <Input
                  label="Quantité"
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(e) => setKit(index, { quantity: e.target.value.replace(/\D/g, '') })}
                />
                <Input
                  label="Détail"
                  value={item.details}
                  onChange={(e) => setKit(index, { details: e.target.value })}
                />
                <Btn
                  variant="fantome"
                  icon="corbeille"
                  aria-label={`Retirer ${item.label}`}
                  onClick={() => setComposition((rows) => rows.filter((_, i) => i !== index))}
                />
              </div>
            ))}
          </div>
          <FormActions>
            <Btn
              icon="plus"
              onClick={() =>
                setComposition((rows) => [...rows, { label: '', quantity: '1', details: '' }])
              }
            >
              Ajouter un élément
            </Btn>
          </FormActions>
        </Panel>
      )}

      <Panel title="Photos">
        <MediaPicker value={images} onChange={setImages} />
      </Panel>

      <FormActions>
        {!creating && (
          <Btn variant="danger" icon="corbeille" onClick={() => setDeleting(true)}>
            Supprimer
          </Btn>
        )}
        <Btn variant="primaire" icon="check" loading={save.isPending} onClick={submit}>
          Enregistrer
        </Btn>
      </FormActions>
      <ConfirmDialog
        open={deleting}
        title={`Supprimer « ${name} » ?`}
        confirmLabel="Supprimer"
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(undefined, { onSuccess: () => router.replace('/admin/boutique/produits') })
        }
      />
    </AdminPage>
  );
}
