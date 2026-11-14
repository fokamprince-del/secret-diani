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
import { ALLERGENS, CATERING_KIND, centsToEuros, eurosToCents } from '@/lib/admin/labels';
import type { components } from '@/lib/api/schema';

type Allergen = components['schemas']['CreateCateringProductDto']['allergens'] extends
  (infer A)[] | undefined
  ? A
  : never;

interface VariantRow {
  id?: string;
  label: string;
  price: string;
  servingsMin: string;
  servingsMax: string;
}

interface CompositionRow {
  label: string;
  quantity: string;
}

export default function CateringProductPage() {
  const { id } = useParams<{ id: string }>();
  const creating = id === 'nouveau';
  const router = useRouter();

  const product = useQuery({
    queryKey: ['admin', 'catering', 'product', id],
    enabled: !creating,
    queryFn: async () =>
      unwrap(
        await adminApi.GET('/api/v1/admin/catering/products/{id}', { params: { path: { id } } }),
      ),
  });
  const categories = useQuery({
    queryKey: ['admin', 'catering', 'categories'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/catering/categories')),
  });
  const flavours = useQuery({
    queryKey: ['admin', 'catering', 'flavours'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/catering/flavours')),
  });

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [visible, setVisible] = useState(true);
  const [variants, setVariants] = useState<VariantRow[]>([
    { label: '', price: '', servingsMin: '', servingsMax: '' },
  ]);
  const [composition, setComposition] = useState<CompositionRow[]>([]);
  const [maxFlavours, setMaxFlavours] = useState('0');
  const [flavourIds, setFlavourIds] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [images, setImages] = useState<
    { mediaId: string; alt: string; previewUrl: string | null }[]
  >([]);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const data = product.data;
    if (!data) return;
    // Formulaire rempli une fois à partir des données chargées (puis édité localement).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(data.name);
    setCategoryId(data.categoryId);
    setDescription(data.description ?? '');
    setVisible(data.visible);
    setVariants(
      data.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        price: centsToEuros(variant.priceCents),
        servingsMin: variant.servingsMin?.toString() ?? '',
        servingsMax: variant.servingsMax?.toString() ?? '',
      })),
    );
    setComposition(
      data.composition.map((item) => ({
        label: item.label,
        quantity: item.quantity?.toString() ?? '',
      })),
    );
    setMaxFlavours(String(data.maxFlavours));
    setFlavourIds(data.flavours.map((flavour) => flavour.id));
    setAllergens(data.allergens);
    setImages(data.images);
    setSeoTitle(data.seoTitle ?? '');
    setSeoDescription(data.seoDescription ?? '');
  }, [product.data]);

  const body = () => {
    if (!name.trim()) throw new Error('Indiquez le nom du produit.');
    const parsed = variants
      .filter((variant) => variant.label.trim() || variant.price.trim())
      .map((variant) => {
        const priceCents = eurosToCents(variant.price);
        if (!variant.label.trim())
          throw new Error('Chaque taille a besoin d’un libellé (ex. « 20 pièces »).');
        if (priceCents === null)
          throw new Error(`Prix invalide pour « ${variant.label} » (ex. 25 ou 25,50).`);
        return {
          ...(variant.id ? { id: variant.id } : {}),
          label: variant.label.trim(),
          priceCents,
          servingsMin: variant.servingsMin ? Number(variant.servingsMin) : null,
          servingsMax: variant.servingsMax ? Number(variant.servingsMax) : null,
        };
      });
    if (parsed.length === 0) throw new Error('Ajoutez au moins une taille avec son prix.');
    return {
      categoryId: categoryId || categories.data?.[0]?.id || '',
      name: name.trim(),
      description: description.trim() || null,
      visible,
      variants: parsed,
      composition: composition
        .filter((item) => item.label.trim())
        .map((item) => ({
          label: item.label.trim(),
          quantity: item.quantity ? Number(item.quantity) : null,
        })),
      maxFlavours: Number(maxFlavours) || 0,
      flavourIds: Number(maxFlavours) > 0 ? flavourIds : [],
      allergens,
      images: images.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
    };
  };

  const invalidate = [['admin', 'catering']];
  const save = useAdminMutation(
    async () =>
      creating
        ? unwrap(await adminApi.POST('/api/v1/admin/catering/products', { body: body() }))
        : unwrap(
            await adminApi.PATCH('/api/v1/admin/catering/products/{id}', {
              params: { path: { id } },
              body: body(),
            }),
          ),
    { success: 'Produit enregistré : la carte est à jour.', invalidate },
  );
  const remove = useAdminMutation(
    async () => {
      const result = await adminApi.DELETE('/api/v1/admin/catering/products/{id}', {
        params: { path: { id } },
      });
      if (result.error) unwrap(result);
    },
    { success: 'Produit supprimé de la carte.', invalidate },
  );

  if (!creating && product.isPending) return <Loading />;
  if (product.isError) return <ErrorBox error={product.error} retry={() => product.refetch()} />;

  const updateVariant = (index: number, patch: Partial<VariantRow>) =>
    setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const updateComposition = (index: number, patch: Partial<CompositionRow>) =>
    setComposition((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <AdminPage
      back={{ href: '/admin/traiteur/produits', label: 'Carte & prix' }}
      title={creating ? 'Nouveau produit' : name || 'Produit'}
      actions={
        <Btn
          variant="primaire"
          icon="check"
          loading={save.isPending}
          onClick={() =>
            save.mutate(undefined, {
              onSuccess: (saved) =>
                creating && router.replace(`/admin/traiteur/produits/${saved.id}`),
            })
          }
        >
          Enregistrer
        </Btn>
      }
    >
      <Panel title="L’essentiel">
        <FormGrid>
          <Input
            label="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Plateau découverte"
          />
          <Select
            label="Catégorie"
            value={categoryId || categories.data?.[0]?.id || ''}
            onChange={(e) => setCategoryId(e.target.value)}
            options={(categories.data ?? []).map((category) => ({
              value: category.id,
              label: `${category.name} (${CATERING_KIND[category.kind]})`,
            }))}
          />
          <Textarea
            label="Description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            hint="Deux phrases gourmandes suffisent : ce qu’il y a dedans, pour quelle occasion."
          />
          <Toggle label="Visible sur le site" checked={visible} onChange={setVisible} />
        </FormGrid>
      </Panel>

      <Panel title="Tailles & prix">
        <div className={styles.lignes}>
          {variants.map((variant, index) => (
            <div key={index} className={styles.ligne} data-cols="4">
              <Input
                label="Taille / conditionnement"
                value={variant.label}
                placeholder="ex. 20 pièces"
                onChange={(e) => updateVariant(index, { label: e.target.value })}
              />
              <Input
                label="Prix (€)"
                inputMode="decimal"
                value={variant.price}
                placeholder="25"
                onChange={(e) => updateVariant(index, { price: e.target.value })}
              />
              <Input
                label="Parts (min–max)"
                value={
                  variant.servingsMin && variant.servingsMax
                    ? `${variant.servingsMin}-${variant.servingsMax}`
                    : variant.servingsMin
                }
                placeholder="ex. 6-8"
                onChange={(e) => {
                  const [min = '', max = ''] = e.target.value
                    .split(/[-–]/)
                    .map((part) => part.replace(/\D/g, ''));
                  updateVariant(index, { servingsMin: min, servingsMax: max });
                }}
              />
              <Btn
                variant="fantome"
                icon="corbeille"
                aria-label={`Retirer la taille ${variant.label}`}
                disabled={variants.length === 1}
                onClick={() => setVariants((rows) => rows.filter((_, i) => i !== index))}
              />
            </div>
          ))}
        </div>
        <FormActions>
          <Btn
            icon="plus"
            onClick={() =>
              setVariants((rows) => [
                ...rows,
                { label: '', price: '', servingsMin: '', servingsMax: '' },
              ])
            }
          >
            Ajouter une taille
          </Btn>
        </FormActions>
      </Panel>

      <Panel title="Composition">
        <p>Ce qui s’affiche sous le nom : « 10 mini burgers », « 10 samoussas »…</p>
        <div className={styles.lignes}>
          {composition.map((item, index) => (
            <div key={index} className={styles.ligne}>
              <Input
                label="Élément"
                value={item.label}
                placeholder="mini burgers"
                onChange={(e) => updateComposition(index, { label: e.target.value })}
              />
              <Input
                label="Quantité"
                inputMode="numeric"
                value={item.quantity}
                placeholder="10"
                onChange={(e) =>
                  updateComposition(index, { quantity: e.target.value.replace(/\D/g, '') })
                }
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
            onClick={() => setComposition((rows) => [...rows, { label: '', quantity: '' }])}
          >
            Ajouter un élément
          </Btn>
        </FormActions>
      </Panel>

      <Panel title="Allergènes">
        <p>
          Obligatoire pour la vente de denrées (règlement INCO). Cochez ceux présents dans la
          recette.
        </p>
        <div className={styles.cases}>
          {ALLERGENS.map((allergen) => (
            <label key={allergen.value} className={styles.case}>
              <input
                type="checkbox"
                checked={allergens.includes(allergen.value as Allergen)}
                onChange={(e) =>
                  setAllergens((list) =>
                    e.target.checked
                      ? [...list, allergen.value as Allergen]
                      : list.filter((value) => value !== allergen.value),
                  )
                }
              />
              {allergen.label}
            </label>
          ))}
        </div>
      </Panel>

      <Panel title="Parfums au choix">
        <FormGrid>
          <Input
            label="Nombre de parfums au choix"
            inputMode="numeric"
            value={maxFlavours}
            hint="0 : pas de choix de parfum (plateaux). Layer cakes : 1 à 3 en général."
            onChange={(e) => setMaxFlavours(e.target.value.replace(/\D/g, ''))}
          />
        </FormGrid>
        {Number(maxFlavours) > 0 && (
          <div className={styles.cases}>
            {(flavours.data ?? []).map((flavour) => (
              <label key={flavour.id} className={styles.case}>
                <input
                  type="checkbox"
                  checked={flavourIds.includes(flavour.id)}
                  onChange={(e) =>
                    setFlavourIds((list) =>
                      e.target.checked
                        ? [...list, flavour.id]
                        : list.filter((value) => value !== flavour.id),
                    )
                  }
                />
                {flavour.name}
              </label>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Photos">
        <p>Photo nette, produit seul, fond clair : la première est la photo principale.</p>
        <MediaPicker value={images} onChange={setImages} />
      </Panel>

      <Panel title="Référencement (facultatif)">
        <FormGrid>
          <Input
            label="Titre pour Google"
            maxLength={70}
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            hint={`${seoTitle.length}/70`}
          />
          <Input
            label="Description pour Google"
            maxLength={160}
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            hint={`${seoDescription.length}/160`}
          />
        </FormGrid>
      </Panel>

      <FormActions>
        {!creating && (
          <Btn variant="danger" icon="corbeille" onClick={() => setDeleting(true)}>
            Supprimer
          </Btn>
        )}
        <Btn
          variant="primaire"
          icon="check"
          loading={save.isPending}
          onClick={() =>
            save.mutate(undefined, {
              onSuccess: (saved) =>
                creating && router.replace(`/admin/traiteur/produits/${saved.id}`),
            })
          }
        >
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
          remove.mutate(undefined, { onSuccess: () => router.replace('/admin/traiteur/produits') })
        }
      >
        <p>Le produit disparaît de la carte. Les demandes passées gardent son nom et son prix.</p>
      </ConfirmDialog>
    </AdminPage>
  );
}
