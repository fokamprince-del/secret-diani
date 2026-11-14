'use client';
/* eslint-disable @next/next/no-img-element -- vignettes déjà optimisées (AVIF/WebP) par le CDN des médias. */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import {
  AdminPage,
  Badge,
  Btn,
  BtnLink,
  ConfirmDialog,
  DataTable,
  Empty,
  ErrorBox,
  Input,
  Loading,
  Panel,
} from '@/components/admin/kit';
import styles from '@/components/admin/catalogue.module.css';
import { adminApi, unwrap, useAdminMutation } from '@/lib/admin/api';
import type { components } from '@/lib/api/schema';
import { formatPrice } from '@/lib/format';

type Stock = components['schemas']['AdminStockDto'];

export default function ShopProductsPage() {
  const products = useQuery({
    queryKey: ['admin', 'shop', 'products'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/shop/products')),
  });
  const stock = useQuery({
    queryKey: ['admin', 'shop', 'stock'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/shop/stock')),
  });
  const [adjusting, setAdjusting] = useState<Stock | null>(null);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [threshold, setThreshold] = useState('');

  const adjust = useAdminMutation(
    async () => {
      if (!adjusting) return;
      const value = Number(delta);
      if (delta.trim() !== '' && (!Number.isInteger(value) || value === 0)) {
        throw new Error('Indiquez un nombre entier, ex. 10 (réception) ou -2 (casse).');
      }
      if (delta.trim() !== '') {
        if (!note.trim()) throw new Error('Indiquez la raison (réception, casse, inventaire…).');
        unwrap(
          await adminApi.POST('/api/v1/admin/shop/stock/{variantId}/adjust', {
            params: { path: { variantId: adjusting.variantId } },
            body: { delta: value, note: note.trim() },
          }),
        );
      }
      if (threshold.trim() !== '' && Number(threshold) !== adjusting.lowStockThreshold) {
        unwrap(
          await adminApi.PUT('/api/v1/admin/shop/stock/{variantId}/threshold', {
            params: { path: { variantId: adjusting.variantId } },
            body: { lowStockThreshold: Number(threshold) },
          }),
        );
      }
    },
    {
      success: 'Stock mis à jour.',
      invalidate: [
        ['admin', 'shop'],
        ['admin', 'dashboard'],
      ],
    },
  );

  return (
    <AdminPage
      title="Produits & stock"
      subtitle="Les kits et accessoires de la boutique, avec leur stock réel."
      actions={
        <BtnLink href="/admin/boutique/produits/nouveau" variant="primaire" icon="plus">
          Nouveau produit
        </BtnLink>
      }
    >
      <Panel title="Catalogue">
        {products.isPending && <Loading />}
        {products.isError && <ErrorBox error={products.error} retry={() => products.refetch()} />}
        {products.data?.length === 0 && <Empty icon="boutique">Aucun produit.</Empty>}
        <ul role="list" className={styles.cartes}>
          {products.data?.map((product) => {
            const image = product.images[0]?.previewUrl;
            const prices = product.variants.map((variant) => variant.priceCents);
            return (
              <li key={product.id}>
                <Link
                  href={`/admin/boutique/produits/${product.id}`}
                  className={`${styles.carte} sans-filet`}
                  data-masque={!product.visible || undefined}
                >
                  <span className={styles.visuel}>
                    {image ? (
                      <img src={image} alt="" />
                    ) : (
                      <span className={styles.sansPhoto}>Sans photo</span>
                    )}
                  </span>
                  <span className={styles.corps}>
                    <span className={styles.nom}>{product.name}</span>
                    <span className={styles.prix}>
                      {prices.length ? formatPrice(Math.min(...prices)) : 'Sans prix'} ·{' '}
                      {product.kind === 'kit' ? 'Kit' : 'Accessoire'}
                    </span>
                    <span className={styles.etiquettes}>
                      {!product.visible && <Badge tone="eteint">Masqué</Badge>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Stock">
        {stock.isPending && <Loading />}
        {stock.data && (
          <DataTable
            caption="Stock par article"
            rows={stock.data}
            rowKey={(row) => row.variantId}
            columns={[
              { header: 'Article', cell: (row) => `${row.productName} · ${row.variantLabel}` },
              { header: 'Réf.', secondary: true, cell: (row) => row.sku },
              { header: 'En stock', align: 'end', cell: (row) => row.onHand },
              { header: 'Réservé', secondary: true, align: 'end', cell: (row) => row.reserved },
              {
                header: 'Disponible',
                align: 'end',
                cell: (row) => (
                  <Badge tone={row.available === 0 ? 'alerte' : row.low ? 'attente' : 'succes'}>
                    {row.available}
                  </Badge>
                ),
              },
              {
                header: '',
                align: 'end',
                cell: (row) => (
                  <Btn
                    variant="fantome"
                    onClick={() => {
                      setAdjusting(row);
                      setDelta('');
                      setNote('');
                      setThreshold(String(row.lowStockThreshold));
                    }}
                  >
                    Ajuster
                  </Btn>
                ),
              },
            ]}
          />
        )}
      </Panel>

      <ConfirmDialog
        open={adjusting !== null}
        title={adjusting ? `${adjusting.productName} · ${adjusting.variantLabel}` : ''}
        confirmLabel="Enregistrer"
        loading={adjust.isPending}
        onClose={() => setAdjusting(null)}
        onConfirm={() => adjust.mutate(undefined, { onSuccess: () => setAdjusting(null) })}
      >
        <p>
          En stock : <strong>{adjusting?.onHand}</strong> · disponible :{' '}
          <strong>{adjusting?.available}</strong>
        </p>
        <Input
          label="Mouvement"
          inputMode="numeric"
          placeholder="+10 réception, -2 casse"
          value={delta}
          onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))}
        />
        <Input
          label="Raison"
          value={note}
          placeholder="Réception fournisseur"
          onChange={(e) => setNote(e.target.value)}
        />
        <Input
          label="Alerte de stock bas à partir de"
          inputMode="numeric"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ''))}
        />
      </ConfirmDialog>
    </AdminPage>
  );
}
