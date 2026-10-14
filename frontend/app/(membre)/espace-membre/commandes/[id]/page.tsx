import type { Metadata } from 'next';
import Link from 'next/link';
import { OrderDetail } from '@/components/member/Orders';

export const metadata: Metadata = { title: 'Détail de la commande' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <div>
        <p>
          <Link href="/espace-membre/commandes">Mes commandes</Link>
        </p>
        <h1>Détail de la commande</h1>
      </div>
      <OrderDetail id={id} />
    </>
  );
}
