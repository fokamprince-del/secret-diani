import type { Metadata } from 'next';
import Link from 'next/link';
import { DataPanel } from '@/components/member/DataPanel';

export const metadata: Metadata = { title: 'Mes données' };

export default function DataPage() {
  return (
    <>
      <div>
        <h1>Mes données</h1>
        <p>
          Vos droits sur vos données personnelles (accès, portabilité, effacement) sont détaillés
          dans la <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </div>
      <DataPanel />
    </>
  );
}
