import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/AuthCard';
import { ResetPasswordForm } from '@/components/auth/PasswordForms';

export const metadata: Metadata = { title: 'Nouveau mot de passe' };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Nouveau mot de passe"
      intro={<p>Vos autres appareils seront déconnectés par sécurité.</p>}
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
