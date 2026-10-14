import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { ForgotPasswordForm } from '@/components/auth/PasswordForms';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Mot de passe oublié"
      intro={
        <p>
          Indiquez l’adresse de votre compte : vous recevrez un lien pour choisir un nouveau mot de
          passe, valable 30 minutes.
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
