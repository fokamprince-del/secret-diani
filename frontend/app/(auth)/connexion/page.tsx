import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Se connecter' };

type SearchParams = Promise<{ retour?: string | string[] }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { retour } = await searchParams;
  return (
    <AuthCard
      title="Se connecter"
      intro={<p>Retrouvez vos formations, vos commandes et votre profil.</p>}
      footer={
        <p>
          Pas encore de compte ? <Link href="/inscription">Créer mon compte</Link>
        </p>
      }
    >
      <LoginForm returnTo={typeof retour === 'string' ? retour : undefined} />
    </AuthCard>
  );
}
