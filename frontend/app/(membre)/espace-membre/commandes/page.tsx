import type { Metadata } from 'next';
import { OrderList } from '@/components/member/Orders';

export const metadata: Metadata = { title: 'Mes commandes' };

export default function OrdersPage() {
  return (
    <>
      <h1>Mes commandes</h1>
      <OrderList />
    </>
  );
}
