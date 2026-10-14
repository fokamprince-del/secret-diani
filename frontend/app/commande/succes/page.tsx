import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { PaymentReturn } from '@/components/shop/PaymentPages';

export const metadata: Metadata = { title: 'Commande confirmée' };

export default function PaymentSuccessPage() {
  return (
    <>
      <PageHeader title="Merci pour votre commande" />
      <div className="conteneur">
        <PaymentReturn />
      </div>
    </>
  );
}
