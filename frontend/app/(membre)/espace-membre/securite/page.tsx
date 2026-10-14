import type { Metadata } from 'next';
import { SecurityPanel } from '@/components/member/SecurityPanel';

export const metadata: Metadata = { title: 'Sécurité' };

export default function SecurityPage() {
  return (
    <>
      <h1>Sécurité</h1>
      <SecurityPanel />
    </>
  );
}
