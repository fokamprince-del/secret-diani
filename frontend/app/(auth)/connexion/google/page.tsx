import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/AuthCard';
import { GoogleReturn } from '@/components/auth/GoogleReturn';

export const metadata: Metadata = { title: 'Connexion avec Google', robots: { index: false } };

type SearchParams = Promise<{ suite?: string | string[] }>;

/** Retour de Google : l'API a posé le cookie de session, la page l'ouvre puis redirige. */
export default async function GoogleReturnPage({ searchParams }: { searchParams: SearchParams }) {
  const { suite } = await searchParams;
  return (
    <AuthCard title="Connexion avec Google">
      <GoogleReturn returnTo={typeof suite === 'string' ? suite : undefined} />
    </AuthCard>
  );
}
