import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { PaymentCancelled } from '@/components/shop/PaymentPages';

export const metadata: Metadata = { title: 'Paiement annulé' };

export default function PaymentCancelledPage() {
  return (
    <>
      <PageHeader title="Paiement annulé" />
      <div className="conteneur">
        <PaymentCancelled />
      </div>
    </>
  );
}
