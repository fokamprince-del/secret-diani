'use client';
/* eslint-disable @next/next/no-img-element -- vignettes déjà optimisées (AVIF/WebP) par le CDN des médias. */

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AdminPage, Badge, BtnLink, Empty, ErrorBox, Loading, Panel } from '@/components/admin/kit';
import { adminApi, unwrap } from '@/lib/admin/api';
import { CATERING_KIND } from '@/lib/admin/labels';
import { formatPrice } from '@/lib/format';
import styles from '@/components/admin/catalogue.module.css';

export default function CateringProductsPage() {
  const categories = useQuery({
    queryKey: ['admin', 'catering', 'categories'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/catering/categories')),
  });
  const products = useQuery({
    queryKey: ['admin', 'catering', 'products'],
    queryFn: async () => unwrap(await adminApi.GET('/api/v1/admin/catering/products')),
  });

  return (
    <AdminPage
      title="Carte & prix"
      subtitle="Ce que voient vos clientes sur la page Traiteur. Un prix modifié ici est en ligne en quelques secondes ; les demandes déjà reçues gardent leur prix."
      actions={
        <BtnLink href="/admin/traiteur/produits/nouveau" variant="primaire" icon="plus">
          Nouveau produit
        </BtnLink>
      }
    >
      {(categories.isPending || products.isPending) && <Loading />}
      {categories.isError && (
        <ErrorBox error={categories.error} retry={() => categories.refetch()} />
      )}
      {products.isError && <ErrorBox error={products.error} retry={() => products.refetch()} />}
      {categories.data && products.data && categories.data.length === 0 && (
        <Empty icon="carte">
          Créez d’abord une catégorie dans{' '}
          <Link href="/admin/traiteur/categories">Catégories & parfums</Link>.
        </Empty>
      )}
      {categories.data?.map((category) => {
        const items = (products.data ?? []).filter((product) => product.categoryId === category.id);
        return (
          <Panel
            key={category.id}
            title={
              <>
                {category.name}{' '}
                <small className={styles.discret}>· {CATERING_KIND[category.kind]}</small>{' '}
                {!category.visible && <Badge tone="eteint">Masquée</Badge>}
              </>
            }
          >
            {items.length === 0 ? (
              <Empty icon="carte">Aucun produit dans cette catégorie.</Empty>
            ) : (
              <ul role="list" className={styles.cartes}>
                {items.map((product) => {
                  const prices = product.variants.map((variant) => variant.priceCents);
                  const image = product.images[0]?.previewUrl;
                  return (
                    <li key={product.id}>
                      <Link
                        href={`/admin/traiteur/produits/${product.id}`}
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
                            {prices.length > 1
                              ? `dès ${formatPrice(Math.min(...prices))}`
                              : prices.length === 1
                                ? formatPrice(prices[0]!)
                                : 'Sans prix'}
                            {product.variants.length > 1 && ` · ${product.variants.length} tailles`}
                          </span>
                          <span className={styles.etiquettes}>
                            {!product.visible && <Badge tone="eteint">Masqué</Badge>}
                            {product.allergens.length === 0 && (
                              <Badge tone="attente">Allergènes à saisir</Badge>
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        );
      })}
    </AdminPage>
  );
}
