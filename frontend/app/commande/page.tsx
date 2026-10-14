import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { Checkout } from '@/components/shop/Checkout';

export const metadata: Metadata = { title: 'Commander' };

export default function CheckoutPage() {
  return (
    <>
      <PageHeader title="Commander" />
      <div className="conteneur">
        <Checkout />
      </div>
    </>
  );
}
