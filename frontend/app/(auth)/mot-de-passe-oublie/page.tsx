import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { ForgotPasswordForm } from '@/components/auth/PasswordForms';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      visual="framboises"
      title="Mot de passe oublié"
      intro={
        <p>
          Indiquez l’adresse de votre compte : vous recevrez par e-mail un code à 6 chiffres à
          saisir ici, pour choisir un nouveau mot de passe.
        </p>
      }
      footer={
        <p>
          <Link href="/connexion">Revenir à la connexion</Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
