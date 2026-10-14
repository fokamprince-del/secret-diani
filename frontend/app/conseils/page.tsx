import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { ConseilsIndex } from './ConseilsIndex';

export const metadata: Metadata = pageMetadata({
  title: 'Conseils & astuces',
  description:
    'Recettes, techniques de pâtisserie et organisation de buffets : les conseils de Diani pour réussir vos créations.',
  path: '/conseils',
});

export default function ConseilsPage() {
  return <ConseilsIndex />;
}
