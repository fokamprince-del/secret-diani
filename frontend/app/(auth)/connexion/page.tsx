import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { GOOGLE_ERRORS, GoogleButton } from '@/components/auth/GoogleButton';
import { LoginForm } from '@/components/auth/LoginForm';
import { FormStatus } from '@/components/ui/States';

export const metadata: Metadata = { title: 'Se connecter' };

type SearchParams = Promise<{ retour?: string | string[]; erreur?: string | string[] }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { retour, erreur } = await searchParams;
  const returnTo = typeof retour === 'string' ? retour : undefined;
  const googleError = typeof erreur === 'string' ? GOOGLE_ERRORS[erreur] : undefined;
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
      {googleError && <FormStatus tone="erreur">{googleError}</FormStatus>}
      <GoogleButton returnTo={returnTo} />
      <LoginForm returnTo={returnTo} />
    </AuthCard>
  );
}
