import type { Metadata } from 'next';
import { connection } from 'next/server';
import { PageHeader } from '@/components/content/PageHeader';
import { Cart } from '@/components/shop/Cart';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = { ...privateMetadata, title: 'Mon panier' };

/** Panier : rendu à la demande (CSP à nonce), contenu chargé par le navigateur. */
export default async function CartPage() {
  await connection();
  return (
    <>
      <PageHeader title="Mon panier" />
      <div className="conteneur">
        <Cart />
      </div>
    </>
  );
}
