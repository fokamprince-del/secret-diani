import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { PackCheckout } from '@/components/courses/PackCheckout';

export const metadata: Metadata = { title: 'Acheter un pack' };

export default async function PackCheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <PageHeader title="Acheter un pack de formation" />
      <div className="conteneur">
        <PackCheckout slug={slug} />
      </div>
    </>
  );
}
