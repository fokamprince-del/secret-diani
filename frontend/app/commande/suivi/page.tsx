import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { OrderTracking } from '@/components/shop/PaymentPages';

export const metadata: Metadata = { title: 'Suivi de commande' };

export default function OrderTrackingPage() {
  return (
    <>
      <PageHeader title="Suivi de commande" />
      <div className="conteneur">
        <OrderTracking />
      </div>
    </>
  );
}
