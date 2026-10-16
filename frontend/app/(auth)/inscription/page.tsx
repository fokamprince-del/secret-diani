import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata: Metadata = { title: 'Créer mon compte' };

export default function RegisterPage() {
  return (
    <AuthCard
      visual="buffet"
      title="Créer mon compte"
      intro={
        <p>
          Un compte est nécessaire pour suivre les formations. Pour la boutique, il est facultatif.
        </p>
      }
      footer={
        <p>
          Déjà un compte ? <Link href="/connexion">Se connecter</Link>
        </p>
      }
    >
      <GoogleButton mention />
      <RegisterForm />
    </AuthCard>
  );
}
