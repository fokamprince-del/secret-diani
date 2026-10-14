import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/AuthCard';
import { EmailLinkAction } from '@/components/auth/EmailLinkAction';

export const metadata: Metadata = { title: 'Confirmer ma nouvelle adresse' };

export default function ConfirmEmailChangePage() {
  return (
    <AuthCard
      title="Confirmer ma nouvelle adresse"
      intro={
        <p>Un clic pour utiliser cette adresse pour vous connecter et recevoir nos e-mails.</p>
      }
    >
      <EmailLinkAction action="confirm-email-change" />
    </AuthCard>
  );
}
